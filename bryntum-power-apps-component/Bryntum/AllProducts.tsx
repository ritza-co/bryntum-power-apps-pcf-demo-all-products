import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

// Bryntum is loaded from a Dataverse web resource at runtime,
// not bundled into the PCF. Adjust the URLs to match your publisher prefix
// (e.g. if your prefix is "test", the URLs become "/WebResources/test_bryntum.js"
// and "/WebResources/test_bryntum.css").
const BRYNTUM_SCRIPT_URL = '/WebResources/test_bryntum.js';
const BRYNTUM_CSS_URL = '/WebResources/test_bryntum.css';
const BRYNTUM_INLINE_SCRIPT_ID = 'bryntum-shared-inline-bundle';
const BRYNTUM_EXTERNAL_SCRIPT_ID = 'bryntum-shared-external-bundle';
const BRYNTUM_CSS_LINK_ID = 'bryntum-shared-css';
const BRYNTUM_LOAD_TIMEOUT_MS = 60000;

// Window global the bundle exposes (see bryntum-shared/src/all.js).
declare global {
  interface Window {
    bryntum?: {
      core: any;
      engine: any;
      grid: any;
      scheduler: any;
      schedulerpro: any;
      gantt: any;
      calendar: any;
      taskboard: any;
    };
  }
}

function isBryntumReady(): boolean {
  const b = window.bryntum;

  return !!(
    b?.core &&
    b?.engine &&
    b?.grid &&
    b?.scheduler &&
    b?.schedulerpro &&
    b?.gantt &&
    b?.calendar &&
    b?.taskboard
  );
}

function describeBryntumGlobal(): string {
  if (!window.bryntum) return 'window.bryntum is undefined';

  return `window.bryntum keys: ${Object.keys(window.bryntum).sort().join(', ')}`;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: number | undefined;

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${BRYNTUM_LOAD_TIMEOUT_MS / 1000}s`));
    }, BRYNTUM_LOAD_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

let bryntumLoadPromise: Promise<void> | null = null;

// Inject the shared Bryntum stylesheet hosted on Dataverse. Idempotent — safe
// to call from multiple PCFs on the same page; the second call sees the
// existing <link> and does nothing.
//
// We use a plain <link> tag (not fetch + inline <style>) because CSS doesn't
// have the realm/timing problem that bit us with the JS bundle — browsers
// apply stylesheets to the same document regardless of how the <link> got
// there, and order-relative-to-other-CSS is preserved.
function loadBryntumCss(): void {
  if (document.getElementById(BRYNTUM_CSS_LINK_ID)) return;

  const link = document.createElement('link');
  link.id = BRYNTUM_CSS_LINK_ID;
  link.rel = 'stylesheet';
  link.href = BRYNTUM_CSS_URL;
  document.head.appendChild(link);
}

function assertLooksLikeBryntumBundle(code: string): void {
  if (!code.includes('bryntum') || !code.includes('window.bryntum')) {
    throw new Error(
      `Fetched ${BRYNTUM_SCRIPT_URL}, but it does not look like the Bryntum bundle. ` +
      `First 120 chars: ${code.slice(0, 120)}`,
    );
  }
}

function executeBryntumBundleInCurrentRealm(code: string): void {
  try {
    const execute = new Function(
      'window',
      'self',
      'globalThis',
      'document',
      `${code}\n//# sourceURL=${BRYNTUM_SCRIPT_URL}`,
    );

    execute.call(window, window, window, window, document);
  } catch (e) {
    throw new Error(
      `Failed to execute ${BRYNTUM_SCRIPT_URL} in the PCF window: ` +
      `${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function injectBryntumBundleAsScript(code: string): void {
  const previousScript = document.getElementById(BRYNTUM_INLINE_SCRIPT_ID);

  previousScript?.remove();

  const script = document.createElement('script');
  script.id = BRYNTUM_INLINE_SCRIPT_ID;
  script.type = 'text/javascript';
  script.textContent = code;
  document.head.appendChild(script);
}

function loadBryntumBundleAsExternalScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const previousScript = document.getElementById(BRYNTUM_EXTERNAL_SCRIPT_ID);
    const script = document.createElement('script');
    const timeoutId = window.setTimeout(() => {
      script.remove();
      reject(new Error(`Loading ${BRYNTUM_SCRIPT_URL} as a script timed out after ${BRYNTUM_LOAD_TIMEOUT_MS / 1000}s`));
    }, BRYNTUM_LOAD_TIMEOUT_MS);

    previousScript?.remove();

    script.id = BRYNTUM_EXTERNAL_SCRIPT_ID;
    script.src = BRYNTUM_SCRIPT_URL;
    script.async = false;
    script.onload = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Failed to load ${BRYNTUM_SCRIPT_URL} as a script`));
    };

    document.head.appendChild(script);
  });
}

async function loadBryntumBundle(): Promise<void> {
  if (isBryntumReady()) return;

  // Start the CSS download immediately so the browser fetches it in parallel
  // with the JS bundle below. We don't await it — the <link> tag applies
  // styles as soon as the browser finishes downloading, regardless of when
  // the JS finishes loading.
  loadBryntumCss();

  // Fetch the bundle as text, then execute it in this PCF's JS realm.
  //
  // Why not just `<script src="...">`? In Power Apps' embedding context, a
  // script element can load in a realm/timing that the PCF React tree does not
  // observe reliably on first navigation. Running the fetched same-origin
  // Dataverse web resource with window/self/globalThis explicitly bound makes
  // the global assignment land on the exact object this component reads.
  const response = await withTimeout(
    fetch(BRYNTUM_SCRIPT_URL, { credentials: 'same-origin' }),
    `Fetching ${BRYNTUM_SCRIPT_URL}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Bryntum (${response.status}) from ${BRYNTUM_SCRIPT_URL}`);
  }

  const code = await withTimeout(response.text(), `Reading ${BRYNTUM_SCRIPT_URL}`);
  let executeError: Error | null = null;

  assertLooksLikeBryntumBundle(code);

  try {
    executeBryntumBundleInCurrentRealm(code);
  } catch (e) {
    executeError = e instanceof Error ? e : new Error(String(e));
    console.warn(executeError);
  }

  // Keep a copy in the document for diagnostics, then fall back to a normal
  // same-origin script tag. The script tag path avoids unsafe-eval if a target
  // environment blocks `new Function`.
  if (!isBryntumReady()) {
    injectBryntumBundleAsScript(code);
    await loadBryntumBundleAsExternalScript();
  }

  if (!isBryntumReady()) {
    throw new Error(
      `Bryntum bundle loaded, but the global is incomplete (${describeBryntumGlobal()}).` +
      (executeError ? ` Current-realm execution error: ${executeError.message}` : ''),
    );
  }
}

async function loadBryntum(): Promise<void> {
  if (isBryntumReady()) return;

  bryntumLoadPromise ||= loadBryntumBundle().catch((error) => {
    bryntumLoadPromise = null;
    throw error;
  });

  return bryntumLoadPromise;
}

export const AllProducts: React.FC = () => {
  const [ready, setReady] = useState<boolean>(isBryntumReady());
  const [error, setError] = useState<string | null>(null);

  const ganttRef        = useRef<HTMLDivElement>(null);
  const schedulerRef    = useRef<HTMLDivElement>(null);
  const schedulerproRef = useRef<HTMLDivElement>(null);
  const calendarRef     = useRef<HTMLDivElement>(null);
  const taskboardRef    = useRef<HTMLDivElement>(null);
  const gridRef         = useRef<HTMLDivElement>(null);

  // Load Bryntum once.
  useEffect(() => {
    let cancelled = false;

    if (ready) return;

    setError(null);
    loadBryntum()
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Mount Bryntum instances once Bryntum is ready and refs are attached.
  useEffect(() => {
    console.debug('[Bryntum demo] mount effect fired, ready=', ready, 'window.bryntum=', isBryntumReady());
    if (!ready || !isBryntumReady()) return;

    const instances: Array<{ destroy: () => void }> = [];
    let cancelled = false;
    let attempt = 0;

    const safe = (label: string, fn: () => unknown) => {
      try {
        const inst = fn();
        if (inst && typeof (inst as { destroy?: unknown }).destroy === 'function') {
          instances.push(inst as { destroy: () => void });
          console.log(`[Bryntum demo] mounted ${label}`);
        } else {
          console.warn(`[Bryntum demo] ${label} returned no instance`, inst);
        }
      } catch (e) {
        console.error(`Bryntum ${label} failed to mount:`, e);
      }
    };

    const refs = [
      { name: 'gantt', ref: ganttRef },
      { name: 'scheduler', ref: schedulerRef },
      { name: 'schedulerpro', ref: schedulerproRef },
      { name: 'calendar', ref: calendarRef },
      { name: 'taskboard', ref: taskboardRef },
      { name: 'grid', ref: gridRef },
    ];
    const containersSized = () =>
      refs.every(({ ref }) => ref.current && ref.current.offsetHeight > 0 && ref.current.offsetWidth > 0);

    const tryMount = () => {
      if (cancelled) return;
      attempt++;
      if (!containersSized()) {
        if (attempt < 5 || attempt % 30 === 0) {
          // Log every ~0.5s so we can see if it's stuck
          console.log(
            `[Bryntum demo] attempt ${attempt}: containers not sized yet`,
            refs.map(({ name, ref }) => ({
              name,
              w: ref.current?.offsetWidth,
              h: ref.current?.offsetHeight,
              rect: ref.current?.getBoundingClientRect(),
            })),
          );
        }
        requestAnimationFrame(tryMount);
        return;
      }
      console.log(`[Bryntum demo] containers sized after ${attempt} attempt(s), mounting…`);
      mount();
    };

    const mount = () => {
      if (cancelled) return;
      const b = window.bryntum!;

    // Gantt
    safe('Gantt', () => ganttRef.current && new b.gantt.Gantt({
        appendTo: ganttRef.current,
        viewPreset: 'weekAndDayLetter',
        barMargin: 8,
        columns: [{ type: 'name', field: 'name', width: 200 }],
        project: {
          autoSetConstraints: true,
          tasks: [
            { id: 1, name: 'Project plan', expanded: true, children: [
              { id: 2, name: 'Research',    startDate: '2026-06-01', duration: 5 },
              { id: 3, name: 'Prototype',   startDate: '2026-06-08', duration: 7 },
              { id: 4, name: 'Documentation', startDate: '2026-06-15', duration: 5 },
            ]},
          ],
          dependencies: [
            { from: 2, to: 3 },
            { from: 3, to: 4 },
          ],
        },
      }));

    // Scheduler
    safe('Scheduler', () => schedulerRef.current && new b.scheduler.Scheduler({
        appendTo: schedulerRef.current,
        startDate: new Date(2026, 5, 1, 8),
        endDate:   new Date(2026, 5, 1, 18),
        viewPreset: 'hourAndDay',
        columns: [{ text: 'Resource', field: 'name', width: 150 }],
        resources: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob'   },
        ],
        events: [
          { id: 1, resourceId: 1, name: 'Standup',    startDate: new Date(2026, 5, 1, 9),  endDate: new Date(2026, 5, 1, 10) },
          { id: 2, resourceId: 2, name: 'Code review', startDate: new Date(2026, 5, 1, 11), endDate: new Date(2026, 5, 1, 12) },
        ],
      }));

    // SchedulerPro
    safe('SchedulerPro', () => schedulerproRef.current && new b.schedulerpro.SchedulerPro({
        appendTo: schedulerproRef.current,
        startDate: new Date(2026, 5, 1, 8),
        endDate:   new Date(2026, 5, 1, 18),
        viewPreset: 'hourAndDay',
        columns: [{ text: 'Resource', field: 'name', width: 150 }],
        project: {
          resources: [
            { id: 1, name: 'Designer' },
            { id: 2, name: 'Engineer' },
          ],
          events: [
            { id: 1, name: 'Mockups',   startDate: new Date(2026, 5, 1, 9),  duration: 2, durationUnit: 'hour' },
            { id: 2, name: 'Implement', startDate: new Date(2026, 5, 1, 11), duration: 4, durationUnit: 'hour' },
          ],
          assignments: [
            { id: 1, eventId: 1, resourceId: 1 },
            { id: 2, eventId: 2, resourceId: 2 },
          ],
        },
      }));

    // Calendar
    safe('Calendar', () => calendarRef.current && new b.calendar.Calendar({
        appendTo: calendarRef.current,
        date: new Date(2026, 5, 1),
        modes: { agenda: null, year: null, day: null, week: null },
        events: [
          { id: 1, name: 'Conference call', startDate: new Date(2026, 5, 1, 10), endDate: new Date(2026, 5, 1, 11) },
          { id: 2, name: 'Sprint planning', startDate: new Date(2026, 5, 3, 14), endDate: new Date(2026, 5, 3, 15, 30) },
          { id: 3, name: 'Team meeting',    startDate: new Date(2026, 5, 5, 9),  endDate: new Date(2026, 5, 5, 10) },
        ],
      }));

    // TaskBoard
    safe('TaskBoard', () => taskboardRef.current && new b.taskboard.TaskBoard({
        appendTo: taskboardRef.current,
        columns: ['todo', 'doing', 'done'],
        columnField: 'status',
        projectModel: {
          tasksData: [
            { id: 1, name: 'Set up repo',      status: 'done'  },
            { id: 2, name: 'Build prototype',  status: 'doing' },
            { id: 3, name: 'Write docs',       status: 'todo'  },
            { id: 4, name: 'Add tests',        status: 'todo'  },
          ],
        },
      }));

    // Grid
    safe('Grid', () => gridRef.current && new b.grid.Grid({
        appendTo: gridRef.current,
        columns: [
          { text: 'Name',  field: 'name',  flex: 1 },
          { text: 'Role',  field: 'role',  flex: 1 },
          { text: 'Score', field: 'score', width: 100, type: 'number' },
        ],
        data: [
          { id: 1, name: 'Alice',   role: 'PM',       score: 92 },
          { id: 2, name: 'Bob',     role: 'Engineer', score: 87 },
          { id: 3, name: 'Charlie', role: 'Designer', score: 95 },
        ],
      }));

    };  // end of mount()

    tryMount();

    return () => {
      cancelled = true;
      instances.forEach((i) => i.destroy());
    };
  }, [ready]);

  // Always render the containers — even before Bryntum is loaded. This is the
  // key to making the PCF work on first page load: Power Apps gets to lay out
  // the container divs on the first render pass, so by the time Bryntum is
  // loaded and useEffect mounts, the containers already have stable sizes.
  // (If we conditionally rendered a loader instead, the containers would be
  // brand-new DOM nodes when Bryntum tried to mount, and Power Apps wouldn't
  // have finished laying them out yet — Bryntum would read height=0 and fail.)
  return (
    <div className="bryntum-demo">
      {error && <div className="loader">Error: {error}</div>}
      {!ready && !error && <div className="loader">Loading Bryntum…</div>}

      <h2>Gantt</h2>
      <div ref={ganttRef} className="product-container" />

      <h2>Scheduler</h2>
      <div ref={schedulerRef} className="product-container" />

      <h2>Scheduler Pro</h2>
      <div ref={schedulerproRef} className="product-container" />

      <h2>Calendar</h2>
      <div ref={calendarRef} className="product-container" />

      <h2>Task Board</h2>
      <div ref={taskboardRef} className="product-container" />

      <h2>Grid</h2>
      <div ref={gridRef} className="product-container" />
    </div>
  );
};

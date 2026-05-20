import * as core from '@bryntum/core-thin';
import * as engine from '@bryntum/engine-thin';
import * as grid from '@bryntum/grid-thin';
import * as scheduler from '@bryntum/scheduler-thin';
import * as schedulerpro from '@bryntum/schedulerpro-thin';
import * as gantt from '@bryntum/gantt-thin';
import * as calendar from '@bryntum/calendar-thin';
import * as taskboard from '@bryntum/taskboard-thin';

// Register English locales. The locale files are UMD-wrapped and register
// themselves via LocaleHelper.publishLocale() during module evaluation
// (no ESM exports). webpack.config.js has a sideEffects:true rule that
// keeps them from being tree-shaken.
import '@bryntum/core-thin/locales/core.locale.En.js';
import '@bryntum/grid-thin/locales/grid.locale.En.js';
import '@bryntum/scheduler-thin/locales/scheduler.locale.En.js';
import '@bryntum/schedulerpro-thin/locales/schedulerpro.locale.En.js';
import '@bryntum/gantt-thin/locales/gantt.locale.En.js';
import '@bryntum/calendar-thin/locales/calendar.locale.En.js';
import '@bryntum/taskboard-thin/locales/taskboard.locale.En.js';

// MERGE into window.bryntum (not replace) — the locale imports above register
// themselves on window.bryntum.locales via Bryntum's LocaleHelper. Overwriting
// the global wipes that registry.
window.bryntum = Object.assign(window.bryntum || {}, {
  core,
  engine,
  grid,
  scheduler,
  schedulerpro,
  gantt,
  calendar,
  taskboard,
});

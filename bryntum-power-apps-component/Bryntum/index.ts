import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { AllProducts } from "./AllProducts";
import * as React from "react";

export class Bryntum implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged: () => void;

    constructor() { }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        return React.createElement(AllProducts);
    }

    public getOutputs(): IOutputs {
        return { };
    }

    public destroy(): void {
        // Nothing to clean up — AllProducts handles its own instance destruction in useEffect cleanup.
    }
}

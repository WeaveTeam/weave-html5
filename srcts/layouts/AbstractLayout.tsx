import * as React from "react";
import SmartComponent from "../ui/SmartComponent";

export type LayoutPanelProps = {
	onReposition?:(position:{left:number, top:number, width:number, height:number})=>void
};

export declare type WeavePathArray = string[];

export interface ILayoutProps extends React.HTMLProps<AbstractLayout>
{
	panelRenderer: (id:WeavePathArray, panelProps?:LayoutPanelProps) => JSX.Element;
}

export abstract class AbstractLayout extends SmartComponent<ILayoutProps, {}>
{
	abstract addPanel(id:WeavePathArray):void;
	abstract removePanel(id:WeavePathArray):void;
	abstract maximizePanel(id:WeavePathArray, maximize:boolean):void;
}

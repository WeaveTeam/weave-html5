/// <reference path="../../typings/c3/c3.d.ts"/>
/// <reference path="../../typings/lodash/lodash.d.ts"/>
/// <reference path="../../typings/d3/d3.d.ts"/>
/// <reference path="../../typings/react/react.d.ts"/>
///<reference path="../../typings/weave/weavejs.d.ts"/>

import {IVisToolProps} from "./IVisTool";
import AbstractC3Tool from "./AbstractC3Tool";
import * as _ from "lodash";
import * as d3 from "d3";
import * as React from "react";
import * as c3 from "c3";
import {ChartAPI, ChartConfiguration} from "c3";
import ToolTip from "./ToolTip";

import IQualifiedKey = weavejs.api.data.IQualifiedKey;
import IAttributeColumn = weavejs.api.data.IAttributeColumn;
import FilteredKeySet = weavejs.data.key.FilteredKeySet;
import DynamicColumn = weavejs.data.column.DynamicColumn;
import SolidFillStyle = weavejs.geom.SolidFillStyle;
import SolidLineStyle = weavejs.geom.SolidLineStyle;
import LinkableNumber = weavejs.core.LinkableNumber;

declare type Record = {
    id: IQualifiedKey,
    data:number,
    line:{color:string},
    fill:{color:string},
    label:string
};

export default class C3PieChart extends AbstractC3Tool
{
    data = Weave.linkableChild(this, DynamicColumn);
    label = Weave.linkableChild(this, DynamicColumn);
    fill = Weave.linkableChild(this,SolidFillStyle);
    line = Weave.linkableChild(this,SolidLineStyle);
    innerRadius = Weave.linkableChild(this, LinkableNumber);

    private RECORD_FORMAT = {
        id: IQualifiedKey,
        data: this.data,
        line: { color: this.line.color },
        fill: { color: this.fill.color },
        label: this.label
    };

    private RECORD_DATATYPE = {
        data: Number,
        line: { color: String},
        fill: {color: String},
        label: String
    };

    private keyToIndex:{[key:string]: number};
    private records:Record[];
    private chartType:string;

    private busy:boolean;
    private dirty:boolean;

    constructor(props:IVisToolProps)
    {
        super(props);

        Weave.getCallbacks(this.selectionFilter).addGroupedCallback(this, this.handleKeyFilters);
        Weave.getCallbacks(this.probeFilter).addGroupedCallback(this, this.handleKeyFilters);

        this.filteredKeySet.setSingleKeySource(this.data);

        this.filteredKeySet.keyFilter.targetPath = ['defaultSubsetKeyFilter'];
        this.selectionFilter.targetPath = ['defaultSelectionKeySet'];
        this.probeFilter.targetPath = ['defaultProbeKeySet'];

        this.keyToIndex = {};
        this.records = [];
        this.validate = _.debounce(this.validate.bind(this), 30);

        this.mergeConfig({
            tooltip: {
                show: false
            },
            data: {
                columns: [],
                type: "pie",
                onmouseover: (d:any) => {
                    if (d && d.hasOwnProperty("index"))
                    {
						var key = this.records[d.index].id;
                        this.probeKeySet.replaceKeys([key]);
                        this.props.toolTip.setState({
                            showToolTip: true,
                            x: this.chart.internal.d3.event.pageX,
                            y: this.chart.internal.d3.event.pageY,
                            columnNamesToValue: ToolTip.getToolTipData(this, [key], [this.data])
                        });
                    }
                },
                onmouseout: (d:any) => {
                    if (d && d.hasOwnProperty("index"))
                    {
                        this.probeKeySet.replaceKeys([]);
                        this.props.toolTip.setState({
                            showToolTip: false
                        });
                    }
                }
            },
            pie: {
                label: {
                    show: true,
                    format: (value:number, ratio:number, id:string):string => {
                        if (this.records && this.records.length)
                        {
                            var record:Record = this.records[this.keyToIndex[id]];
                            if (record && record.label)
                            {
                                return record.label as string;
                            }
                            return String(value);
                        }
                    }
                }
            },
            donut: {
                label: {
                    show: true,
                    format: (value:number, ratio:number, id:string):string => {
                        if (this.records && this.records.length)
                        {
                            var record = this.records[this.keyToIndex[id]];
                            if (record && record.label)
                            {
                                return record.label as string;
                            }
                            return String(value);
                        }
                    }
                }
            },
            legend: {
                show: false
            }
        });
    }

	protected handleC3Render():void
	{
        this.busy = false;
        this.handleKeyFilters();
        if (this.dirty)
            this.validate();
	}

	protected handleC3Selection():void
	{
		if (!this.selectionKeySet)
			return;
		let selectedIndices = this.chart.selected();
		let selectedKeys = selectedIndices.map((value) => this.records[value.index].id);
		this.selectionKeySet.replaceKeys(selectedKeys);
	}
	
	private handleKeyFilters()
	{
		if (this.chart && Weave.detectChange(this, this.selectionFilter))
		{
	        var selectedKeys:IQualifiedKey[] = this.selectionKeySet ? this.selectionKeySet.keys : [];
			var keyToIndex = weavejs.util.ArrayUtils.createLookup(this.records, "id");
	        var selectedIndices:number[] = selectedKeys.map((key:IQualifiedKey) => {
				return Number(keyToIndex.get(key));
	        });
			this.chart.select(null, selectedIndices, true);
		}
		this.updateStyle();
	}
	
    private updateStyle():void
    {
		if (this.busy || !this.chart || !this.records)
            return;

        var selectedKeys:IQualifiedKey[] = this.selectionKeySet ? this.selectionKeySet.keys : [];
        var probedKeys:IQualifiedKey[] = this.probeKeySet ? this.probeKeySet.keys : [];
        var selectedIndices:number[] = selectedKeys.map((key:IQualifiedKey) => {
            return Number(this.keyToIndex[key as any]);
        });
        var probedIndices:number[] = probedKeys.map((key:IQualifiedKey) => {
            return Number(this.keyToIndex[key as any]);
        });
        var keys:string[] = Object.keys(this.keyToIndex);
        var indices:number[] = keys.map((key:string) => {
            return Number(this.keyToIndex[key]);
        });

        var unselectedIndices:number[] = _.difference(indices, selectedIndices);
        unselectedIndices = _.difference(unselectedIndices,probedIndices);
        if (probedIndices.length)
        {
            //this.customStyle(probedIndices, "circle", ".c3-shape", {opacity:1.0, "stroke-opacity": 0.5, "stroke-width": 1.5});
            this.chart.focus(probedKeys as any[] as string[]);
        }
        else if (selectedIndices.length)
        {
            //this.customStyle(unselectedIndices, "circle", ".c3-shape", {opacity: 0.3, "stroke-opacity": 0.0});
            //this.customStyle(selectedIndices, "circle", ".c3-shape", {opacity: 1.0, "stroke-opacity": 1.0});
            this.chart.focus(selectedKeys as any[] as string[]);
        }
        else if (!probedIndices.length)
        {
            //this.customStyle(indices, "circle", ".c3-shape", {opacity: 1.0, "stroke-opacity": 0.0});
            this.chart.focus();
        }
    }

    validate(forced:boolean = false):void
	{
		if (Weave.isBusy(this))
			return;
        if (this.busy)
		{
            this.dirty = true;
            return;
        }
        this.dirty = false;

        var dataChanged = Weave.detectChange(this, this.data, this.label, this.innerRadius, this.fill, this.line, this.filteredKeySet);

        if (dataChanged)
		{
            this.records = weavejs.data.ColumnUtils.getRecords(this.RECORD_FORMAT, this.filteredKeySet.keys, this.RECORD_DATATYPE);

            this.keyToIndex = {};

            this.records.forEach( (record:Record, index:number) => {
               this.keyToIndex[record.id as any] = index;
            });

            var chartType:string = "pie";
            if (this.innerRadius.value > 0)
            {
                chartType = "donut"
            }

            var columns:[string, number][] = [];

            columns = this.records.map(function(record:Record) {
                var tempArr:[string, number] = [record.id as any, record.data];
                return tempArr;
            });

            var colors:{[key:string]: string} = {};
            this.records.forEach((record:Record) => {
                colors[record.id as any] = record.fill.color as string || "#808080";
            });

            this.c3Config.data.columns = columns;
            this.c3Config.data.type = chartType;
            this.c3Config.data.colors = colors;
            this.c3Config.data.unload = true;
        }
        var axisChanged = Weave.detectChange(this, this.xAxisName, this.yAxisName, this.margin.top, this.margin.bottom, this.margin.left, this.margin.right);

        if (forced || dataChanged || axisChanged)
        {
            this.busy = true;
            c3.generate(this.c3Config);
        }
    }

	get deprecatedStateMapping()
	{
		return [super.deprecatedStateMapping, {
            "children": {
                "visualization": {
                    "plotManager": {
                        "plotters": {
                            "plot": {
                                "filteredKeySet": this.filteredKeySet,
                                "data": this.data,
                                "fill": this.fill,
                                "innerRadius": this.innerRadius,
                                "label": this.label,
                                "line": this.line,
                                "labelAngleRatio": 0
                            }
                        }
                    }
                }
            }
        }];
	}
}

Weave.registerClass("weavejs.tool.C3PieChart", C3PieChart, [weavejs.api.ui.IVisTool, weavejs.api.core.ILinkableObjectWithNewProperties]);
Weave.registerClass("weave.visualization.tools::PieChartTool", C3PieChart);

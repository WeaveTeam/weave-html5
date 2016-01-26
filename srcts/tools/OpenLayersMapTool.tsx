///<reference path="../../typings/lodash/lodash.d.ts"/>
///<reference path="../../typings/openlayers/openlayers.d.ts"/>
///<reference path="../../typings/jquery/jquery.d.ts"/>
///<reference path="../../typings/weave/WeavePath.d.ts"/>
/// <reference path="../../typings/react/react.d.ts"/>
/// <reference path="../../typings/react/react-dom.d.ts"/>

import * as ol from "openlayers";
import * as lodash from "lodash";
import * as React from "react";
import * as ReactDOM from "react-dom";
import jquery from "jquery";

import {IVisTool, IVisToolProps, IVisToolState} from "./IVisTool";
import {registerToolImplementation} from "../WeaveTool";
/* eslint-disable */
import Layer from "./OpenLayersMap/Layers/Layer";
import FeatureLayer from "./OpenLayersMap/Layers/FeatureLayer";
import GeometryLayer from "./OpenLayersMap/Layers/GeometryLayer";
import TileLayer from "./OpenLayersMap/Layers/TileLayer";
import ImageGlyphLayer from "./OpenLayersMap/Layers/ImageGlyphLayer";
import ScatterPlotLayer from "./OpenLayersMap/Layers/ScatterPlotLayer";
import LabelLayer from "./OpenLayersMap/Layers/LabelLayer";
/* eslint-enable */

import PanCluster from "./OpenLayersMap/PanCluster";
import InteractionModeCluster from "./OpenLayersMap/InteractionModeCluster";
import ProbeInteraction from "./OpenLayersMap/ProbeInteraction";
import DragSelection from "./OpenLayersMap/DragSelection";
import CustomZoomToExtent from "./OpenLayersMap/CustomZoomToExtent";
/* global Weave, weavejs */

declare var Weave:any;
declare var weavejs:any;

class WeaveOpenLayersMap extends React.Component<IVisToolProps, IVisToolState> {

	layers:Map<string,Layer>;
	interactionModePath:WeavePath;
	map:ol.Map;
	zoomButtons:ol.control.Zoom;
	slider:ol.control.ZoomSlider;
	zoomExtent: ol.control.ZoomToExtent;
	pan:PanCluster;
	mouseModeButtons:InteractionModeCluster;
	plotManager:WeavePath;
	plottersPath:WeavePath;
	layerSettingsPath:WeavePath;
	zoomBoundsPath:WeavePath;

	centerCallbackHandle:any;
	resolutionCallbackHandle:any;
	private element:Element;
	private toolPath:WeavePath;

	constructor(props)
	{
		super(props);
		GeometryLayer; TileLayer; ImageGlyphLayer; ScatterPlotLayer; LabelLayer;/* Forces the inclusion of the layers. */
		this.layers = new Map<string,Layer>();
		this.toolPath = props.toolPath;
	}

	handleMissingSessionStateProperties(newState):void
	{

	}

	componentDidMount():void
	{
		this.map = new ol.Map({
			interactions: ol.interaction.defaults({ dragPan: false }),
			controls: [],
			target: this.element
		});

		/* Setup custom interactions */

		this.interactionModePath = this.toolPath.weave.path("WeaveProperties", "toolInteractions", "defaultDragMode");

		let dragPan: ol.interaction.DragPan = new ol.interaction.DragPan();
		let dragSelect: DragSelection = new DragSelection();
		let probeInteraction: ProbeInteraction = new ProbeInteraction(this);
		let dragZoom: ol.interaction.DragZoom = new ol.interaction.DragZoom({ condition: ol.events.condition.always });

		this.map.addInteraction(dragPan);
		this.map.addInteraction(dragSelect);
		this.map.addInteraction(probeInteraction);
		this.map.addInteraction(dragZoom);

		this.interactionModePath.addCallback(this, () => {
			let interactionMode = this.interactionModePath.getState() || "select";
			dragPan.setActive(interactionMode === "pan");
			dragSelect.setActive(interactionMode === "select");
			dragZoom.setActive(interactionMode === "zoom");
		}, true);

		/* Setup custom controls */

		this.zoomButtons = new ol.control.Zoom();
		this.slider = new ol.control.ZoomSlider();
		this.pan = new PanCluster();
		this.zoomExtent = new CustomZoomToExtent({ label: jquery("<span>").addClass("fa fa-arrows-alt").css({ "font-weight": "normal" })[0]});

		this.map.addControl(this.zoomButtons);

		this.toolPath.push("showZoomControls").addCallback(this, this.onZoomControlToggle, true);
		this.toolPath.push("showMouseModeControls").addCallback(this, this.onMouseModeControlToggle, true);

		this.mouseModeButtons = new InteractionModeCluster({interactionModePath: this.interactionModePath});

		this.plotManager = this.toolPath.push("children", "visualization", "plotManager");

		/* Todo replace override[X,Y][Min,Max] with a single overrideZoomBounds element; alternatively,
		 * make a set of parameters on zoombounds itself. */

		for (let extreme of ["Min", "Max"])
			for (let axis of ["X", "Y"])
				this.plotManager.push("override" + axis + extreme).addCallback(this, this.onViewParametersChanged);

		this.toolPath.push("projectionSRS").addCallback(this, this.onViewParametersChanged, true);


		this.plottersPath = this.plotManager.push("plotters");
		this.layerSettingsPath = this.plotManager.push("layerSettings");
		this.zoomBoundsPath = this.plotManager.push("zoomBounds");

		this.plotManager.addCallback(this, this.requestDetail, true);
		this.plottersPath.getObject().childListCallbacks.addImmediateCallback(this, this.plottersChanged, true);
		this.zoomBoundsPath.addCallback(this, this.getSessionCenter, true);
	}

	onViewParametersChanged():void
	{
		let extent = [];

		for (let extreme of ["Min", "Max"])
			for (let axis of ["X", "Y"])
				extent.push(this.plotManager.push("override" + axis + extreme).getState());

		if (!lodash.every(extent, Number.isFinite))
		{
			extent = undefined;
		}

		let projection = this.toolPath.push("projectionSRS").getState() || "EPSG:3857";
		let view = new ol.View({projection, extent});
		view.set("extent", extent);

		this.centerCallbackHandle = view.on("change:center", this.setSessionCenter, this);
		this.resolutionCallbackHandle = view.on("change:resolution", this.setSessionZoom, this);
		this.map.setView(view);

		this.getSessionCenter();
	}

	componentDidUpdate():void
	{
		this.map.updateSize();
		var viewport = this.map.getViewport();
		var screenBounds = new weavejs.geom.Bounds2D(0, 0, viewport.clientWidth, viewport.clientHeight);
		this.zoomBoundsPath.getObject().setScreenBounds(screenBounds, true);
	}

	updateControlPositions():void
	{
		if (this.toolPath.push("showZoomControls").getState())
		{
			jquery(this.element).find(".ol-control.panCluster").css({top: "0.5em", left: "0.5em"});
			jquery(this.element).find(".ol-control.ol-zoom").css({top: "5.5em", left: "2.075em"});
			jquery(this.element).find(".ol-control.ol-zoomslider").css({top: "9.25em", left: "2.075em"});
			jquery(this.element).find(".ol-control.iModeCluster").css({top: "20.75em", left: "0.6em"});
		}
		else
		{
			jquery(this.element).find(".ol-control.ol-zoom-extent").css({top: "0.5em", left: "0.5em"});
			jquery(this.element).find(".ol-control.ol-zoom").css({ top: "2.625em", left: "0.5em" });
			jquery(this.element).find(".ol-control.iModeCluster").css({ top: "5.6em", left: "0.5em" });
		}
	}


	onMouseModeControlToggle():void
	{
		let showMouseModeControls = this.toolPath.push("showMouseModeControls").getState();
		if (showMouseModeControls)
		{
			this.map.addControl(this.mouseModeButtons);
		}
		else
		{
			this.map.removeControl(this.mouseModeButtons);
		}
		this.updateControlPositions();
	}


	onZoomControlToggle():void
	{
		let showZoomControls = this.toolPath.push("showZoomControls").getState();
		if (showZoomControls)
		{
			this.map.addControl(this.slider);
			this.map.addControl(this.pan);
			this.map.removeControl(this.zoomExtent);
		}
		else
		{
			this.map.removeControl(this.slider);
			this.map.removeControl(this.pan);
			this.map.addControl(this.zoomExtent);
		}
		this.updateControlPositions();
	}

	setSessionCenter():void
	{
		var [xCenter, yCenter] = this.map.getView().getCenter();

		var zoomBounds = this.zoomBoundsPath.getObject();

		var dataBounds = new weavejs.geom.Bounds2D();
		zoomBounds.getDataBounds(dataBounds);
		dataBounds.setXCenter(xCenter);
		dataBounds.setYCenter(yCenter);
		zoomBounds.setDataBounds(dataBounds);
	}

	setSessionZoom():void
	{
		var resolution = this.map.getView().getResolution();

		var zoomBounds = this.zoomBoundsPath.getObject();

		var dataBounds = new weavejs.geom.Bounds2D();
		var screenBounds = new weavejs.geom.Bounds2D();
		zoomBounds.getDataBounds(dataBounds);
		zoomBounds.getScreenBounds(screenBounds);
		dataBounds.setWidth(screenBounds.getWidth() * resolution);
		dataBounds.setHeight(screenBounds.getHeight() * resolution);
		dataBounds.makeSizePositive();
		zoomBounds.setDataBounds(dataBounds);
	}

	getSessionCenter():void
	{
		var zoomBounds = this.zoomBoundsPath.getObject();
		var dataBounds = new weavejs.geom.Bounds2D();
		zoomBounds.getDataBounds(dataBounds);
		var center = [dataBounds.getXCenter(), dataBounds.getYCenter()];
		var scale = zoomBounds.getXScale();
		
		this.map.getView().un("change:center", this.setSessionCenter, this);
		this.map.getView().un("change:resolution", this.setSessionZoom, this);

		this.map.getView().setCenter(center);
		this.map.getView().setResolution(1 / scale);

		lodash.defer(() => {
			this.map.getView().on("change:center", this.setSessionCenter, this);
			this.map.getView().on("change:resolution", this.setSessionZoom, this);
		});
	}
	
	requestDetail():void
	{
		var zoomBounds = this.zoomBoundsPath.getObject();
		for (var name of this.plottersPath.getNames())
		{
			var layer:Layer = this.layers.get(name);
			if (!layer)
				continue;
			for (var sgc of Weave.getDescendants(this.plottersPath.getObject(name), weavejs.data.column.StreamedGeometryColumn))
			{
				if (layer.inputProjection == layer.outputProjection)
				{
					weavejs.data.column.StreamedGeometryColumn.metadataRequestMode = 'xyz';
					sgc.requestGeometryDetailForZoomBounds(zoomBounds);
				}
				else
				{
					//TODO - don't request everything when reprojecting
					weavejs.data.column.StreamedGeometryColumn.metadataRequestMode = 'all';
					sgc.requestGeometryDetail(sgc.collectiveBounds, 0);
				}
			}
		}
	}

	plottersChanged():void
	{
		var oldNames = Array.from(this.layers.keys());
		var newNames = this.plottersPath.getNames();

		var removedNames = lodash.difference(oldNames, newNames);
		var addedNames = lodash.difference(newNames, oldNames);

		removedNames.forEach(function (name) {
			if (this.layers.get(name)) {
				this.layers.get(name).dispose();
			}
			this.layers.delete(name);
		}, this);

		addedNames.forEach(function (name) {
			let layer:Layer = Layer.newLayer(this, name);
			this.layers.set(name, layer);
		}, this);
		/* */
		for (let idx in newNames)
		{
			let layer:Layer = this.layers.get(newNames[idx]);

			if (!layer || !layer.olLayer) {
				continue;
			}

			layer.olLayer.setZIndex(idx + 2);
		}
	}

	destroy():void
	{

	}

	render():JSX.Element {
        return <div ref={(c:HTMLElement) => {this.element = c;}} style={{width: "100%", height: "100%"}}/>;
    }
}

export default WeaveOpenLayersMap;

registerToolImplementation("weave.visualization.tools::MapTool", WeaveOpenLayersMap);

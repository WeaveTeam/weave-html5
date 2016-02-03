///<reference path="../../../../typings/lodash/lodash.d.ts"/>
///<reference path="../../../../typings/openlayers/openlayers.d.ts"/>
///<reference path="../../../../typings/weave/weavejs.d.ts"/>

import * as ol from "openlayers";
import * as lodash from "lodash";

import Layer from "./Layer";
import StandardLib from "../../../utils/StandardLib";

import IQualifiedKey = weavejs.api.data.IQualifiedKey;
import KeySet = weavejs.data.key.KeySet;
import FilteredKeySet = weavejs.data.key.FilteredKeySet;

export abstract class FeatureLayer extends Layer {
	/* A FeatureLayer assumes that each feature will have multiple custom style properties on each feature, which are managed based on selection. */
	private updateMetaStyle:Function;
	private debounced_updateMetaStyles:Function;

	private changedItems:Set<IQualifiedKey>;

	public selectionKeySet:KeySet;

	public probeKeySet:KeySet;

	public filteredKeySet:FilteredKeySet;

	private selectableBoolean: any; /*LinkableBoolean*/

	source:ol.source.Vector;

	constructor(parent, layerName)
	{
		super(parent, layerName);
		
		this.updateMetaStyle = this.updateMetaStyle_unbound.bind(this);
		this.debounced_updateMetaStyles = lodash.debounce(this.updateMetaStyles.bind(this), 0);

		this.olLayer = new ol.layer.Vector();
		this.source = new ol.source.Vector({wrapX: false});

		/* Every feature that is added should register a handler to automatically recompute the metastyles when the styles change. */
		this.source.on("addfeature", this.onFeatureAdd, this);

		this.changedItems = new Set();

		this.selectionKeySet = this.layerPath.weave.getObject("defaultSelectionKeySet")
		this.probeKeySet = this.layerPath.weave.getObject("defaultProbeKeySet");
		this.filteredKeySet = this.layerPath.getObject("filteredKeySet");

		let selectionKeyHandler = this.updateSetFromKeySet.bind(this, this.selectionKeySet, new Set<IQualifiedKey>());
		let probeKeyHandler = this.updateSetFromKeySet.bind(this, this.probeKeySet, new Set<IQualifiedKey>());

		Weave.getCallbacks(this.selectionKeySet).addGroupedCallback(this, selectionKeyHandler, true);
		Weave.getCallbacks(this.probeKeySet).addGroupedCallback(this, probeKeyHandler, true);
		Weave.getCallbacks(this.filteredKeySet).addGroupedCallback(this, this.updateMetaStyles, true);
		this.selectableBoolean = this.settingsPath.getObject("selectable");

		this.settingsPath.push("selectable").addCallback(this, this.updateMetaStyles);
	}

	onFeatureAdd(vectorEvent)
	{
		vectorEvent.feature.on("propertychange", this.onFeaturePropertyChange, this);
	}

	onFeaturePropertyChange(objectEvent)
	{
		let propertyName = objectEvent.key;

		if (!lodash.contains(FeatureLayer.Styles, propertyName))
		{
			/* The property that changed isn't one of our metaStyle properties, so we don't care. */
			return;
		}
		else
		{
			/* The property that changed was a metastyle, and as such the styles should be recomputed */
			this.debounced_updateMetaStyles();
		}
	}

	abstract updateStyleData():void;

	getToolTipColumns(): Array<any> /* Array<IAttributeColumn> */
	{
		return [];
	}

	static toColorArray(color: string|number, alpha)
	{
		var colorArray;

		if (typeof color == "number")
		{
			colorArray = ol.color.asArray("#" + StandardLib.decimalToHex(color as number));
		}
		else /* if typeof color is string */
		{
			if (color[0] === "#") {
				colorArray = ol.color.asArray(color as string);
			}
			else {
				colorArray = ol.color.asArray("#" + StandardLib.decimalToHex(Number(color as string)));
			}
		}

		colorArray = [].concat(colorArray); /* Should not be modified since it is cached in ol.color.asArray */

		if (!colorArray) {
			return null;
		}

		colorArray[3] = Number(alpha);
		return colorArray;
	}

	static toColorRGBA(colorString, alpha)
	{
		var colorArray = FeatureLayer.toColorArray(colorString, alpha);
		return ol.color.asString(colorArray);
	}

	updateSetFromKeySet(keySet:KeySet, previousContents:Set<IQualifiedKey>)
	{
		if (!this.source) return; //HACK
		
		let wasEmpty:boolean = previousContents.size === 0;
		let isEmpty:boolean = keySet.keys.length === 0;

		/* If the selection keyset becomes empty or nonempty, we should recompute all the styles. Otherwise, only recompute the styles of the features which changed. */
		if (keySet === this.selectionKeySet && isEmpty !== wasEmpty)
		{
			this.updateMetaStyles();
		}
		else
		{
			this.changedItems.clear();

			for (let key of keySet.keys) {
				if (!previousContents.has(key))
					this.changedItems.add(key);
			}

			for (let key of previousContents) {
				if (!keySet.containsKey(key))
					this.changedItems.add(key);
			}

			this.changedItems.forEach(function (featureId)
			{
				let feature = this.source.getFeatureById(featureId);
				if (feature)
				{
					this.updateMetaStyle(feature);
				}
			}, this);
		}

		previousContents.clear();
		for (let key of keySet.keys) previousContents.add(key);
	}

	updateMetaStyles()
	{
		if (!this.source) return; //HACK

		this.source.forEachFeature(this.updateMetaStyle, this);
	}

	updateMetaStyle_unbound(feature)
	{
		let id:IQualifiedKey = <IQualifiedKey>feature.getId();
		let nullStyle = new ol.style.Style({});
		let unselectedStyle = feature.get("unselectedStyle") || nullStyle;
		let normalStyle = feature.get("normalStyle") || nullStyle;
		let selectedStyle = feature.get("selectedStyle") || nullStyle;
		let probedStyle = feature.get("probedStyle") || nullStyle;
		let zOrder = feature.get("zOrder") || 0;
		let replace = feature.get("replace");
		let newStyle;

		if (!this.filteredKeySet.containsKey(id))
		{
			feature.setStyle(nullStyle);
			return;
		}

		if (!this.selectableBoolean.state)
		{
			feature.setStyle(normalStyle);
			return;
		}

		if (!this.selectionKeySet.containsKey(id) && !this.probeKeySet.containsKey(id) && this.selectionKeySet.keys.length > 0)
		{
			if (replace)
			{
				newStyle = unselectedStyle;
				newStyle.setZIndex(zOrder);
			}
			else
			{
				newStyle = [].concat(unselectedStyle);
				newStyle[0].setZIndex(zOrder);
			}

		}
		else
		{
			newStyle = [].concat(normalStyle);
			newStyle[0].setZIndex(zOrder);
		}

		if (this.selectionKeySet.containsKey(id))
		{
			if (replace)
			{
				newStyle = selectedStyle;
				newStyle.setZIndex(Number.MAX_SAFE_INTEGER - 3);
			}
			else
			{
				newStyle = newStyle.concat(selectedStyle);
				newStyle[0].setZIndex(Number.MAX_SAFE_INTEGER - 3);
			}
		}

		if (this.probeKeySet.containsKey(id))
		{
			if (replace)
			{
				newStyle = probedStyle;
				newStyle.setZIndex(Number.MAX_SAFE_INTEGER);
			}
			else
			{
				newStyle = newStyle.concat(probedStyle);
				newStyle[0].setZIndex(Number.MAX_SAFE_INTEGER);
			}
		}

		feature.setStyle(newStyle);
	}

	static olFillFromWeaveFill(fill, fade?)
	{
		if (fade === undefined) fade = 1;

		let color = fill.color && FeatureLayer.toColorArray(fill.color, fill.alpha * fade) || [0, 0, 0, 0];
		return new ol.style.Fill({color});
	}

	static olStrokeFromWeaveStroke(stroke:any, fade?:number)
	{
		if (fade === undefined) fade = 1;

		let color:Array<number> = (stroke.color !== undefined && stroke.color !== null) && FeatureLayer.toColorArray(stroke.color, stroke.alpha * fade) || [0, 0, 0, 1];

		let lineCap:string = stroke.lineCap === "none" ? "butt" : stroke.lineCap || "round";
		let lineJoin:string = stroke.lineJoin === null ? "round" : stroke.lineJoin || "round";
		let miterLimit:number = Number(stroke.miterLimit);
		let width:number = Number(stroke.weight);
		if (width == 0) color[3] = 0; /* If the width is 0, set alpha to 0 to avoid rendering; canvas context would ignore setting width to 0 */

		return new ol.style.Stroke({color, lineCap, lineJoin, miterLimit, width});
	}

	static getOlProbedStyle(baseStrokeStyle)
	{
		let width = baseStrokeStyle.getWidth();

		return [
				new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: [0, 0, 0, 1],
						width: width + FeatureLayer.PROBE_HALO_WIDTH + FeatureLayer.PROBE_LINE_WIDTH
					}),
					zIndex: Number.MAX_SAFE_INTEGER - 2
				}),
				new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: [255, 255, 255, 1],
						width: width + FeatureLayer.PROBE_HALO_WIDTH
					}),
					zIndex: Number.MAX_SAFE_INTEGER - 1
				})
		];
	}

	static getOlSelectionStyle(baseStrokeStyle)
	{
		let width = baseStrokeStyle.getWidth();
		let lineCap = baseStrokeStyle.getLineCap();
		let lineJoin = baseStrokeStyle.getLineJoin();
		let miterLimit = baseStrokeStyle.getMiterLimit();

		return [new ol.style.Style({
				stroke: new ol.style.Stroke({
					color: [0, 0, 0, 0.5],
					width: width + FeatureLayer.SELECT_WIDTH,
					lineCap, lineJoin, miterLimit}),
				zIndex: Number.MAX_SAFE_INTEGER - 4
		})];
	}

	static SELECT_WIDTH:number = 5;
	static PROBE_HALO_WIDTH:number = 4;
	static PROBE_LINE_WIDTH:number = 1;
	static Styles:Object = {
		NORMAL: "normalStyle",
		UNSELECTED: "unselectedStyle", /* For the case where a selection has been made in the layer but the element is not one of them. */
		SELECTED: "selectedStyle",
		PROBED: "probedStyle"	
	}
};

export interface MetaStyleProperties {
	normalStyle: ol.style.Style|Array<ol.style.Style>;
	unselectedStyle: ol.style.Style|Array<ol.style.Style>;
	selectedStyle: ol.style.Style|Array<ol.style.Style>;
	probedStyle: ol.style.Style|Array<ol.style.Style>;
};

export default FeatureLayer;

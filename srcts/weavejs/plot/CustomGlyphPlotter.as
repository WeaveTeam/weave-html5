/* ***** BEGIN LICENSE BLOCK *****
 *
 * This file is part of Weave.
 *
 * The Initial Developer of Weave is the Institute for Visualization
 * and Perception Research at the University of Massachusetts Lowell.
 * Portions created by the Initial Developer are Copyright (C) 2008-2015
 * the Initial Developer. All Rights Reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 * 
 * ***** END LICENSE BLOCK ***** */

namespace weavejs.plot
{
	import BitmapData = flash.display.BitmapData;
	
	import ILinkableHashMap = weavejs.api.core.ILinkableHashMap;
	import IAttributeColumn = weavejs.api.data.IAttributeColumn;
	import IQualifiedKey = weavejs.api.data.IQualifiedKey;
	import Bounds2D = weavejs.geom.Bounds2D;
	import IPlotTask = weavejs.api.ui.IPlotTask;
	import IPlotter = weavejs.api.ui.IPlotter;
	import ITextPlotter = weavejs.api.ui.ITextPlotter;
	import LinkableFunction = weavejs.core.LinkableFunction;
	import LinkableHashMap = weavejs.core.LinkableHashMap;

	public class CustomGlyphPlotter extends AbstractGlyphPlotter implements ITextPlotter
	{
		WeaveAPI.ClassRegistry.registerImplementation(IPlotter, CustomGlyphPlotter, "ActionScript glyphs");
		
		public function CustomGlyphPlotter()
		{
			setColumnKeySources([dataX, dataY]);
			vars.childListCallbacks.addImmediateCallback(this, handleVarList);
			this.addSpatialDependencies(this.vars, this.function_getDataBoundsFromRecordKey, this.function_getBackgroundDataBounds);
		}
		private function handleVarList():void
		{
			// When a new column is created, register the stats to trigger callbacks and affect busy status.
			// This will be cleaned up automatically when the column is disposed.
			var newColumn:IAttributeColumn = vars.childListCallbacks.lastObjectAdded as IAttributeColumn;
			if (newColumn)
				Weave.linkableChild(vars, WeaveAPI.StatisticsCache.getColumnStatistics(newColumn));
		}
		
		/**
		 * This can hold any objects that should be stored in the session state.
		 */
		public const vars:ILinkableHashMap = Weave.linkableChild(this, LinkableHashMap);
		public const locals:Object = {};
		
		public const function_drawPlot:LinkableFunction = Weave.linkableChild(this, new LinkableFunction(script_drawPlot, false, true, ['keys','dataBounds','screenBounds','destination']));
		public static const script_drawPlot:String = <![CDATA[
			// Parameter types: Array, Bounds2D, Bounds2D, BitmapData
			function(keys, dataBounds, screenBounds, destination)
			{
				import GraphicsBuffer' = 'weave.data.AttributeColumns.DynamicColumn';
				import 'weave.utils.GraphicsBuffer';
			
				var getStats = WeaveAPI.StatisticsCache.getColumnStatistics;
				var colorColumn = vars.requestObject('color', DynamicColumn, false);
				var sizeColumn = vars.requestObject('size', DynamicColumn, false);
				var sizeStats = getStats(sizeColumn);
				var buffer = locals.buffer || (locals.buffer = new GraphicsBuffer());
				var key;
			
				colorColumn.globalName = 'defaultColorColumn';
				buffer.destination(destination)
					.lineStyle(1, 0x000000, 0.5); // weight, color, alpha
			
				for each (key in keys)
				{
					getCoordsFromRecordKey(key, tempPoint); // uses dataX,dataY
					// project x,y data coordinates to screen coordinates
					dataBounds.projectPointTo(tempPoint, screenBounds);
			
					if (isNaN(tempPoint.x) || isNaN(tempPoint.y))
						continue;
					
					var x = tempPoint.x, y = tempPoint.y;
					var size = 20 * sizeStats.getNorm(key);
					var color = colorColumn.getValueFromKey(key, Number);
					
					// draw graphics
					if (isFinite(color))
						buffer.beginFill(color, 1.0); // color, alpha
					if (isNaN(size))
					{
						size = 10;
						buffer.drawRect(x - size/2, y - size/2, size, size);
					}
					else
					{
						buffer.drawCircle(tempPoint.x, tempPoint.y, size);
					}
					buffer.endFill();
				}
				buffer.flush();
			}
		]]>;
		override public function drawPlotAsyncIteration(task:IPlotTask):Number
		{
			try
			{
				// BIG HACK to work properly as a symbolPlotter in GeometryPlotter
				if (task.iteration <= task.recordKeys.length)
					return 0;
				
				function_drawPlot.call(this, task.recordKeys, task.dataBounds, task.screenBounds, task.buffer);
			}
			catch (e:*)
			{
				JS.error(e);
			}
			return 1;
		}
		
		public const function_drawBackground:LinkableFunction = Weave.linkableChild(this, new LinkableFunction(script_drawBackground, false, true, ['dataBounds', 'screenBounds', 'destination']));
		public static const script_drawBackground:String = <![CDATA[
			// Parameter types: Bounds2D, Bounds2D, BitmapData
			function(dataBounds, screenBounds, destination)
			{
				/*
				import GraphicsBuffer' = 'weave.utils.GraphicsBuffer';
			
				var graphicBuffer = new GraphicsBuffer(destination);
			
				// draw background graphics here
			
				graphicsBuffer.flush();
				*/
			}
		]]>;
		override public function drawBackground(dataBounds:Bounds2D, screenBounds:Bounds2D, destination:BitmapData):void
		{
			try
			{
				function_drawBackground.apply(this, arguments);
			}
			catch (e:*)
			{
				JS.error(e);
			}
		}
		
		public const function_getDataBoundsFromRecordKey:LinkableFunction = Weave.linkableChild(this, new LinkableFunction(script_getDataBoundsFromRecordKey, false, true, ['key', 'output']));
		public static const script_getDataBoundsFromRecordKey:String = <![CDATA[
			// Parameter types: IQualifiedKey, Array
			function(key, output)
			{
				getCoordsFromRecordKey(key, tempPoint); // uses dataX,dataY
				
				var bounds = initBoundsArray(output);
				bounds.includePoint(tempPoint);
				if (isNaN(tempPoint.x))
					bounds.setXRange(-Infinity, Infinity);
				if (isNaN(tempPoint.y))
					bounds.setYRange(-Infinity, Infinity);
			}
		]]>;
		override public function getDataBoundsFromRecordKey(key:IQualifiedKey, output:Array):void
		{
			try
			{
				function_getDataBoundsFromRecordKey.apply(this, arguments);
			}
			catch (e:*)
			{
				JS.error(e);
			}
		}
		
		public const function_getBackgroundDataBounds:LinkableFunction = Weave.linkableChild(this, new LinkableFunction(script_getBackgroundDataBounds, false, true, ['output']));
		public static const script_getBackgroundDataBounds:String = <![CDATA[
			// Parameter type: Bounds2D
			function (output)
			{
				if (zoomToSubset.value)
				{
					output.reset();
				}
				else
				{
					var getStats = WeaveAPI.StatisticsCache.getColumnStatistics;
					var statsX = getStats(dataX);
					var statsY = getStats(dataY);
					
					output.setBounds(
						statsX.getMin(),
						statsY.getMin(),
						statsX.getMax(),
						statsY.getMax()
					);
				}
			}
		]]>;
		override public function getBackgroundDataBounds(output:Bounds2D):void
		{
			try
			{
				function_getBackgroundDataBounds.apply(this, arguments);
			}
			catch (e:*)
			{
				JS.error(e);
			}
		}
	}
}

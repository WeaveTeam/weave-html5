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
	import Bitmap = flash.display.Bitmap;
	import BitmapData = flash.display.BitmapData;
	import Graphics = PIXI.Graphics;
	import Matrix = flash.geom.Matrix;
	import Point = weavejs.geom.Point;
	
	import Bounds2D = weavejs.geom.Bounds2D;
	import Bounds2D = weavejs.geom.Bounds2D;
	
	public class RamachandranBackgroundPlotter extends AbstractPlotter
	{
		public function RamachandranBackgroundPlotter()
		{
		}
		override public function getBackgroundDataBounds(output:Bounds2D):void
		{
			output.setBounds(-180,-180,180,180);
		}
		override public function drawBackground(dataBounds:Bounds2D, screenBounds:Bounds2D, destination:BitmapData):void
		{
			var g:Graphics = tempShape.graphics;
			g.clear();
			g.lineStyle(2, 0, 1);
			
			// project to screen bounds
			tempBounds.setBounds(-180,180,180,-180);
			dataBounds.projectCoordsTo(tempBounds, screenBounds);
			
			var matrix:Matrix = new Matrix();
			matrix.scale(tempBounds.getWidth() / _missingImage.width, tempBounds.getHeight() / _missingImage.height);
			matrix.translate(tempBounds.getXMin(), tempBounds.getYMin());
			destination.draw(_missingImage, matrix, null, null, null, true);
			
			// draw vertical line through x=0
			g.moveTo(tempBounds.getXCenter(), tempBounds.getYMin());
			g.lineTo(tempBounds.getXCenter(), tempBounds.getYMax());
				
			// draw horizontal line through y=0
			g.moveTo(tempBounds.getXMin(), tempBounds.getYCenter());
			g.lineTo(tempBounds.getXMax(), tempBounds.getYCenter());
			
			destination.draw(tempShape);
		}
		
		private const tempBounds:Bounds2D = new Bounds2D();
		private const tempPoint:Point = new Point();

		// background image
		[Embed(source="/weave/resources/images/RamaPlot.png")]
		private static var _missingImageClass:Class;
		private static const _missingImage:BitmapData = Bitmap(new _missingImageClass()).bitmapData;
	}
}
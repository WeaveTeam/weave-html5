import ILinkableObject = weavejs.api.core.ILinkableObject;
import LinkablePlaceholder = weavejs.core.LinkablePlaceholder;
import WeavePath = weavejs.path.WeavePath;

import * as _ from "lodash";
import * as React from "react";
import * as ReactDOM from "react-dom";
import reactUpdate from "react-addons-update";
import {CSSProperties} from "react";
import ReactUtils from "./utils/ReactUtils";
import {HBox, VBox} from "./react-ui/FlexBox";
import LinkableWatcher = weavejs.core.LinkableWatcher;

export interface IWeaveComponentRendererProps extends React.HTMLProps<WeaveComponentRenderer>
{
	weave:Weave,
	path:typeof LinkableWatcher.prototype.targetPath,
	requestType?:new(..._:any[])=>React.Component<any,any>,
	props?:any
}

export interface IWeaveComponentRendererState
{
	actualType?:React.ComponentClass<any>;
	target?:ILinkableObject;
}

export default class WeaveComponentRenderer extends React.Component<IWeaveComponentRendererProps, IWeaveComponentRendererState>
{
	watcher:LinkableWatcher;
	key:number = 0;
	
	constructor(props:IWeaveComponentRendererProps)
	{
		super(props);
		this.state = {};
		this.componentWillReceiveProps(props);
	}
	
	shouldComponentUpdate(nextProps:IWeaveComponentRendererProps, nextState:IWeaveComponentRendererState, nextContext:any):boolean
	{
		return !_.isEqual(this.state, nextState)
			|| !_.isEqual(this.props, nextProps)
			|| !_.isEqual(this.context, nextContext);
	}
	
	componentWillReceiveProps(props:IWeaveComponentRendererProps):void
	{
		if (this.props.weave != props.weave || !this.watcher)
		{
			// force React to create a new component for the new instance of Weave
			this.key++;
			
			if (this.watcher)
			{
				// replace the component with a placeholder before it gets unmounted and disposed due to the key changing
				LinkablePlaceholder.replaceInstanceWithPlaceholder(this.watcher.target);
				Weave.dispose(this.watcher);
			}
			
			if (props.weave)
			{
				this.watcher = Weave.disposableChild(props.weave, LinkableWatcher);
				Weave.getCallbacks(this.watcher).addGroupedCallback(this, this.handleWatcher);
			}
			else
			{
				this.watcher = null;
			}
		}
		
		if (this.watcher)
		{
			if (props.requestType)
				props.weave.requestObject(props.path, props.requestType);
			this.watcher.targetPath = props.path;
		}
	}

	handleWatcher():void
	{
		var ComponentClass = LinkablePlaceholder.getClass(this.watcher.target) as React.ComponentClass<any> & typeof ILinkableObject;
		if (!React.Component.isPrototypeOf(ComponentClass))
			ComponentClass = null;
		
		this.setState({
			actualType: ComponentClass,
			target: this.watcher.target
		});
	}
	
	handleInstance=(component:React.Component<any, any>):void=>
	{
		if (component)
			LinkablePlaceholder.setInstance(this.watcher.target, component);
		
		ReactUtils.updateState(this, {target: component});
	}
	
	componentWillUnmount():void
	{
		Weave.dispose(this.watcher);
		this.watcher = null;
	}

	render():JSX.Element
	{
		var props = _.clone(this.props);
		props.style = _.merge({flex: 1}, props.style);
		delete props.weave;
		delete props.path;
		delete props.props;
		return (
			<VBox {...props}>
				{
					this.state.actualType
					?	React.createElement(this.state.actualType, _.merge({key: this.key, ref: this.handleInstance}, this.props.props))
					:	null
				}
			</VBox>
		);
	}
}

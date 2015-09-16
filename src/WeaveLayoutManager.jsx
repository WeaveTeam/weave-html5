import React from "react";
import Layout from "./react-flexible-layout/Layout.jsx";
import _ from "lodash";
import {WeaveTool, getToolImplementation} from "./WeaveTool.jsx";

const LAYOUT = "Layout";

export class WeaveLayoutManager extends React.Component {

    constructor(props) {
        super(props);

        this.weave = this.props.weave;
        this.state = {
            layout: this.weave.path(LAYOUT).request("FlexibleLayout").getState()
        };
        this._boundHandleStateChange = this.handleStateChange.bind(this);

        this.margin = 8;
    }

    componentDidMount() {
        window.addEventListener("resize", this._forceUpdate = () => { this.forceUpdate(); });
        this.element = React.findDOMNode(this);
        this.weave.path().getValue("childListCallbacks.addGroupedCallback")(null, this.forceUpdate.bind(this), true);
        this.weave.path(LAYOUT).addCallback(_.debounce(this._layoutChanged.bind(this), 100));
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this._forceUpdate);
    }

    _layoutChanged() {
        this.setState({
            layout: this.weave.path(LAYOUT).getState()
        });
    }

    handleStateChange() {
        this.setState({
            layout: this.refs[LAYOUT].state
        });
    }

    onDragStart(id) {
        this.refs[LAYOUT].startDrag(id);
        console.log("drag start");
    }

    render () {
        this.weave.path(LAYOUT).state(this.state.layout);
        var paths = this.weave.path().getChildren();
        var children = [];
        var rect;
        if(this.element) {
            rect = this.element.getBoundingClientRect();
        }

        for(var i = 0; i < paths.length; i++) {
            var path = paths[i];
            var impl = getToolImplementation(path.getType());
            var toolName = path.getPath()[0];
            var node;
            var toolRect;
            var toolPosition;
            if(impl) {
                if(this.refs[LAYOUT] && rect) {
                    node = this.refs[LAYOUT].getDOMNodeFromId(path.getPath());
                    if(node) {
                        toolRect = node.getBoundingClientRect();
                        toolPosition = {
                            top: toolRect.top - rect.top,
                            left: toolRect.left - rect.left,
                            width: toolRect.right - toolRect.left,
                            height: toolRect.bottom - toolRect.top,
                            position: "absolute"
                        };
                        toolPosition.maxHeight = toolPosition.height;
                        toolPosition.maxWidth = toolPosition.width;
                    }
                }
                children.push(<WeaveTool ref={toolName} key={toolName} toolPath={path} onDragStart={this.onDragStart.bind(this, path.getPath())} margin={this.margin} style={toolPosition}/>);
            }
        }
        return (
            <div style={{position: "absolute", width: "100%", height: "100%"}}>
                <Layout onStateChange={this._boundHandleStateChange} key={LAYOUT} ref={LAYOUT} state={this.state.layout} weave={this.weave}/>
                {children}
            </div>
        );
    }

}


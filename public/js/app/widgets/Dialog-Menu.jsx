define([
    'jquery',
    'reactPropTypes',
    'reactClassset',
    'app/stores/global-store',
    'jsx!widgets/List',
    // non-return
    'helpers/object-assign'
],
function(
    $,
    PropTypes,
    ReactCx,
    GlobalStore,
    List
) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    return class DialogMenu extends React.Component{
        static propTypes = {
            arrowDirection: PropTypes.oneOf(['LEFT', 'RIGHT', 'UP', 'BOTTOM']),
            className: PropTypes.object,
            items: PropTypes.array
        }

        static defaultProps = {
            arrowDirection: 'LEFT',
            className: {},
            items: []
        };

        constructor(props) {
            super(props);
            this.state = {
                checkedItem: -1
            };
        }

        componentDidMount() {
            GlobalStore.onResetDialogMenuIndex(() => this.resetCheckedItem());
        }

        componentWillUnmount() {
            GlobalStore.removeResetDialogMenuIndexListener(() => this.resetCheckedItem());
        }

        resetCheckedItem = () => {
            this.setState({ checkedItem: -1 });
        }

        toggleSubPopup = (itemIndex, isChecked) => {
            this.setState({
                checkedItem: isChecked ? itemIndex : -1
            });
        }

        _renderItem = () => {
            const arrowClassName = ReactCx.cx({
                'arrow': true,
                'arrow-left': 'LEFT' === this.props.arrowDirection,
                'arrow-right': 'RIGHT' === this.props.arrowDirection,
                'arrow-up': 'UP' === this.props.arrowDirection,
                'arrow-bottom': 'BOTTOM' === this.props.arrowDirection,
            });

            return this.props.items
                .filter(item => !!item.label)
                .map((item, index) => {
                    const {
                        content,
                        disable,
                        forceKeepOpen,
                        label,
                        labelClass,
                        previewOn
                    } = item;
                    const { checkedItem } = this.state;
                    const disablePopup = (disable || !content);
                    const checked = (forceKeepOpen || previewOn) || ((checkedItem === index) && !disablePopup);

                    let itemLabelClassName = {
                        'dialog-label': true,
                        'disable': disable === true
                    };

                    itemLabelClassName = Object.assign(itemLabelClassName, labelClass || {});

                    return {
                        label: (
                            <label className='ui-dialog-menu-item'>
                                <input
                                    name='dialog-opener'
                                    className='dialog-opener'
                                    type='checkbox'
                                    disabled={disablePopup}
                                    checked={checked}
                                    onClick={e => {
                                        if (!forceKeepOpen) {
                                            this.toggleSubPopup(index, e.target.checked);
                                        }
                                    }}
                                />
                                <div className={ReactCx.cx(itemLabelClassName)}>
                                    {label}
                                </div>
                                <label className='dialog-window'>
                                    <div className={arrowClassName}/>
                                    <div className='dialog-window-content'>
                                        {content}
                                    </div>
                                </label>
                            </label>
                        )
                    };
                });
        }

        // Lifecycle
        render() {
            const className = this.props.className;
            className['ui ui-dialog-menu'] = true;

            return (
                <List
                    ref="uiDialogMenu"
                    items={this._renderItem()}
                    className={ReactCx.cx(className)}
                />
            );
        }
    };
});

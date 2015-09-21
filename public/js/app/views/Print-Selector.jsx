define([
    'react',
    'jquery',
    'jsx!widgets/Select',
    'jsx!widgets/List',
    'helpers/api/discover',
    'helpers/api/touch',
    'helpers/api/config'
], function(React, $, SelectView, ListView, discover, touch, config) {
    'use strict';

    var View = React.createClass({
        displayName: 'PrinterSelection',
        selected_printer: null,

        _renderPrinterSelection: function(lang) {
            var self = this,
                lang = lang.select_printer,
                options = self.state.printOptions,
                content = (<ListView className="printer-list" items={options} ondblclick={self._selectPrinter}/>);

            return content;
        },

        _renderEnterPassword: function(lang) {
            var lang = lang.select_printer;

            return (
                <form className="form" onSubmit={this._submit}>
                    <p className="text-center">{lang.notification}</p>
                    <input
                        type="password"
                        ref="password"
                        className="span12"
                        defaultValue=""
                        placeholder={lang.please_enter_password}
                        autoFocus
                    />
                    <button className="btn btn-action btn-full-width sticky-bottom">{lang.submit}</button>
                </form>
            );
        },

        _goBackToPrinterList: function() {
            this.setState({
                auth_failure: null
            });
        },

        _renderAuthFailure: function() {
            var lang = args.state.lang.select_printer;

            return (
                <div>
                    <p>{lang.auth_failure}</p>
                    <button className="btn btn-action btn-full-width sticky-bottom" onClick={this._goBackToPrinterList}>
                        {lang.retry}
                    </button>
                </div>
            );
        },

        _selectPrinter: function(e) {
            var self = this,
                $el = $(e.target.parentNode),
                meta = $el.data('meta'),
                opts = {
                    onFail: function(data) {
                        self.setState({
                            waiting: false
                        });
                    }
                };

            self.selected_printer = meta;

            self._auth(meta.serial, '', opts);
        },

        _returnSelectedPrinter: function() {
            this.props.onGettingPrinter(this.selected_printer);
        },

        _renderPrinterItem: function(printer) {
            var meta = JSON.stringify(printer);

            return (
                <label className="device printer-item" data-meta={meta}>
                    <input type="radio" name="printer-group" value={printer.serial}/>
                    <div className="col device-name">{printer.name}</div>
                    <div className="col module">adf</div>
                    <div className="col status">adsff</div>
                </label>
            );
        },

        _renderSpinner: function() {
            return (
                <div className="spinner-flip"/>
            );
        },

        _submit: function(e) {
            e.preventDefault();

            var self = this,
                opts = {
                    onError: function(data) {
                        self.setState({
                            auth_failure: true,
                            waiting: false
                        });
                    }
                },
                selected_printer = self.selected_printer,
                password, touch_socket;

            self.setState({
                waiting: true
            });

            password = self.refs.password.getDOMNode().value;

            touch_socket = self._auth(selected_printer.serial, password, opts);
        },

        _auth: function(serial, password, opts) {
            opts = opts || {};
            opts.onError = opts.onError || React.PropTypes.func;

            var self = this,
                _opts = {
                    onSuccess: function(data) {
                        self._returnSelectedPrinter();
                        self.setState({
                            waiting: false
                        });
                    },
                    onError: function(data) {
                        opts.onError();
                    }
                },
                touch_socket;

            self.setState({
                waiting: true
            });

            touch_socket = touch(_opts).send(serial, password);
        },

        _handleClose: function(e) {
            React.unmountComponentAtNode(View);
            this.props.onClose();
        },

        render: function() {
            var self = this,
                lang = self.props.lang,
                cx = React.addons.classSet,
                wrapperClass = ['select-printer'],
                auth_failure = self.state.auth_failure,
                content = (
                    self._renderPrinterSelection(lang)
                );

            if ('' !== self.props.className) {
                wrapperClass.push(self.props.className);
            }

            wrapperClass = cx.apply(null, wrapperClass);

            if (true === auth_failure) {
                content = self._renderAuthFailure();
            }

            if (true === self.state.waiting) {
                content = self._renderSpinner();
            }

            return (
                <div className={wrapperClass}>
                        <div className="device">
                            <div className="col device-name">{lang.device_selection.device_name}</div>
                            <div className="col module">{lang.device_selection.module}</div>
                            <div className="col status">{lang.device_selection.status}</div>
                        </div>
                        {content}
                        <svg className="arrow" version="1.1" xmlns="http://www.w3.org/2000/svg"
                            width="36.8" height="20">
                            <polygon points="0,0 0,20 36.8,10"/>
                        </svg>
                </div>
            );
        },

        getInitialState: function() {
            return {
                printOptions: [],
                waiting: false,
                loadFinished: false
            };
        },

        getDefaultProps: function() {
            return {
                lang: React.PropTypes.object,
                className: React.PropTypes.string,
                onGettingPrinter: React.PropTypes.func,
                onClose: React.PropTypes.func
            };
        },

        componentWillMount: function () {
            var self = this,
                options = [],
                refreshOption = function(options) {
                    options.forEach(function(el) {
                        el.label = self._renderPrinterItem(el);
                    });

                    self.setState({
                        printOptions: options,
                        loadFinished: true
                    });
                };

            if (-1 === location.search.indexOf('debug')) {
                config().read('printers', {
                    onFinished: function(response) {
                        options = JSON.parse(response);

                        refreshOption(options);
                    }
                });
            }
            else {
                discover(function(printers) {
                    refreshOption(printers);
                });
            }
        }

    });

    return View;
});

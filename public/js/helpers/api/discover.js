/**
 * API discover
 * Ref: https://github.com/flux3dp/fluxghost/wiki/websocket-discover
 */
define([
    'helpers/websocket',
    'helpers/api/config',
    'helpers/array-findindex',
    'helpers/object-assign'
], function(Websocket) {
    'use strict';

    var ws = ws || new Websocket({
            method: 'discover'
        }),
        printers = [],
        dispatchers = [],
        idList = [],
        sendFoundPrinter = function() {
            dispatchers.forEach(function(dispatcher) {
                dispatcher.sender(printers);
            });
        },
        findIndex,
        onMessage = function(data) {
            findIndex = function(el) {
                return el.uuid === data.uuid;
            };
            var existing_key = printers.findIndex(findIndex);

            if (-1 === existing_key) {
                if (typeof data === 'string') {
                    data = data.replace(/NaN/g, null);
                    data = JSON.parse(data);
                }

                printers.push(data);
            }
            else {
                // if existing. update attributes
                for (var key in data) {
                    if (true === data.hasOwnProperty(key)) {
                        printers[existing_key][key] = data[key];
                    }
                }
            }

            if (false === data.alive && -1 < existing_key) {
                // delete it from printers
                printers.splice(existing_key, 1);
            }

            // set a sleep
            clearTimeout(timer);
            timer = setTimeout(function() {
                sendFoundPrinter();
            }, BUFFER);
        },
        BUFFER = 100,
        timer;

    ws.onMessage(onMessage);

    return function(id, getPrinters) {
        getPrinters = getPrinters || function() {};

        var index = idList.indexOf(id);

        if (0 === idList.length || -1 === index) {
            idList.push(id);
            dispatchers.push({
                id: id,
                sender: getPrinters
            });
        }
        else {
            dispatchers[index] = {
                id: id,
                sender: getPrinters
            };
        }

        if (0 < printers.length) {
            getPrinters(printers);
        }

        return {
            connection: ws,
            removeListener: function(_id) {
                var _index = idList.indexOf(_id);

                idList = idList.splice(_index, 1);
                dispatchers = dispatchers.splice(_index, 1);
            },
            sendAggressive: function() {
                ws.send('aggressive');
            }
        };
    };
});

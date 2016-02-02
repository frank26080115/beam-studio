/**
 * check device status and action
 */
define([
    'jquery',
    'helpers/i18n',
    'helpers/device-master',
    'app/constants/device-constants',
    'app/actions/alert-actions',
    'app/stores/alert-store',
    'app/actions/progress-actions'
], function(
    $,
    i18n,
    DeviceMaster,
    DeviceConstants,
    AlertActions,
    AlertStore,
    ProgressActions
) {
    'use strict';

    var lang = i18n.get();

    return function(printer) {
        var deferred = $.Deferred(),
            onYes = function(id) {
                DeviceMaster.selectDevice(printer).then(function() {
                    switch (id) {
                    case 'kick':
                        DeviceMaster.kick().done(function() {
                            deferred.resolve('ok');
                        });
                        break;
                    case 'abort':
                        DeviceMaster.stop().done(function() {
                            deferred.resolve('ok');
                        });
                        break;
                    }
                });
            };

        AlertStore.onYes(onYes);

        deferred.always(function() {
            AlertStore.removeYesListener(onYes);
        });

        switch (printer.st_id) {
        // null for simulate
        case null:
        // null for not found default device
        case undefined:
        case DeviceConstants.status.IDLE:
            // no problem
            deferred.resolve('auth');
            break;
        case DeviceConstants.status.RAW:
        case DeviceConstants.status.SCAN:
        case DeviceConstants.status.MAINTAIN:
            // ask kick?
            ProgressActions.close();
            AlertActions.showPopupYesNo('kick', lang.message.device_is_used);
            break;
        case DeviceConstants.status.COMPLETED:
        case DeviceConstants.status.ABORTED:
            // quit
            DeviceMaster.quit().done(function() {
                deferred.resolve('ok');
            });
            break;
        case DeviceConstants.status.RUNNING:
        case DeviceConstants.status.PAUSED:
        case DeviceConstants.status.PAUSED_FROM_STARTING:
        case DeviceConstants.status.PAUSED_FROM_RUNNING:
            // ask for abort
            ProgressActions.close();
            AlertActions.showPopupYesNo('abort', lang.message.device_is_used);
            break;
        default:
            // device busy
            ProgressActions.close();
            AlertActions.showDeviceBusyPopup('on-select-printer');
            break;
        }

        return deferred.promise();
    };
});
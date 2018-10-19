define(function() {
    'use strict';

    return {
        // Status
        STARTING        : 'STARTING',
        RUNNING         : 'RUNNING',
        READY           : 'READY',
        PAUSING         : 'PAUSING',
        PAUSED          : 'PAUSED',
        CONNECTED       : 'CONNECTED',
        DISCONNECTED    : 'DISCONNECTED',
        BUSY            : 'BUSY',
        ERROR           : 'ERROR',
        ABORTED         : 'ABORTED',
        UNKNOWN         : 'UNKNOWN',
        COMPLETED       : 'COMPLETED',
        COMPLETING      : 'COMPLETING',
        FATAL           : 'FATAL',
        OK              : 'OK',
        IDLE            : 'IDLE',
        RESUMING        : 'RESUMING',
        AUTH_ERROR      : 'AUTH_ERROR',
        HEAD_OFFLINE    : 'HEAD_OFFLINE',
        HEAD_ERROR      : 'HEAD_ERROR',
        WRONG_HEAD      : 'WRONG_HEAD',
        AUTH_FAILED     : 'AUTH_FAILED',
        HEADER_OFFLINE  : 'HEADER_OFFLINE',
        HEADER_ERROR    : 'HEADER_ERROR',
        WRONG_HEADER    : 'WRONG_HEADER',
        TILT            : 'TILT',
        FAN_FAILURE     : 'FAN_FAILURE',
        TIMEOUT         : 'TIMEOUT',
        FILAMENT_RUNOUT : 'FILAMENT_RUNOUT',
        UNKNOWN_ERROR   : 'UNKNOWN_ERROR',
        UNKNOWN_STATUS  : 'UNKNOWN_STATUS',
        USER_OPERATION  : 'USER_OPERATION',
        UPLOADING       : 'UPLOADING',
        WAITING_HEAD    : 'WAITING_HEAD',
        CORRECTING      : 'CORRECTING',
        OCCUPIED        : 'OCCUPIED',
        SCANNING        : 'SCANNING',
        CALIBRATING     : 'CALIBRATING',
        HEATING         : 'HEATING',
        MONITOR_TOO_OLD : 'FLUXMONITOR_VERSION_IS_TOO_OLD',
        RESOURCE_BUSY   : 'RESOURCE_BUSY',

        // folder
        NOT_EXIST       : 'NOT_EXIST',
        PREVIEW         : 'PREVIEW',
        DOWNLOAD        : 'DOWNLOAD',
        UPLOAD          : 'UPLOAD',
        SELECT          : 'SELECT',

        // Print head
        EXTRUDER        : 'EXTRUDER',
        PRINTER         : 'PRINTER',
        LASER           : 'LASER',

        // Command
        RESUME          : 'RESUME',
        PAUSE           : 'PAUSE',
        STOP            : 'STOP',
        REPORT          : 'REPORT',
        ABORT           : 'ABORT',
        QUIT            : 'QUIT',
        QUIT_TASK       : 'QUIT_TASK',
        KICK            : 'KICK',
        LS              : 'LS',
        LOAD_FILAMENT   : 'LOAD',
        LOAD_FLEXIBLE_FILAMENT   : 'LOADF',
        UNLOAD_FILAMENT : 'UNLOAD',
        MOVEMENT_TEST   : "data:;base64,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",
        BEAMBOX_CAMERA_TEST: 'data:application/octet-stream;base64,RkN4MDAwMQp1AgAAASAAAAAABSCamZm+wACgDEawAADNQgAA6kKwAADNQgAA6kIgAADIQrAAAM1CAAC8QrAAAM1CAAC8QiAAAAAAIAAAAACwAADNQgAAtkKwAADNQgAAtkIgAADIQrAAAM1CAACKQrAAAM1CAACKQiAAAAAAIAAAAACwAADNQgAAhEKwAADNQgAAhEIgAADIQrAAAM1CAAAsQrAAAM1CAAAsQiAAAAAAIAAAAACwAACbQgAA6kKwAACbQgAA6kIgAADIQrAAAJtCAAC8QrAAAJtCAAC8QiAAAAAAIAAAAACwAACbQgAAtkKwAACbQgAAtkIgAADIQrAAAJtCAACKQrAAAJtCAACKQiAAAAAAIAAAAACwAACbQgAAhEKwAACbQgAAhEIgAADIQrAAAJtCAAAsQrAAAJtCAAAsQiAAAAAAIAAAAACwAAARQwAAuUKwAAARQwAAuUIgAADIQrAAANBCAAC5QrAAANBCAAC5QiAAAAAAIAAAAACwAADKQgAAuUKwAADKQgAAuUIgAADIQrAAAJ5CAAC5QrAAAJ5CAAC5QiAAAAAAIAAAAACwAACYQgAAuUKwAACYQgAAuUIgAADIQrAAAAxCAAC5QrAAAAxCAAC5QiAAAAAAIAAAAACwAAARQwAAh0KwAAARQwAAh0IgAADIQrAAANBCAACHQrAAANBCAACHQiAAAAAAIAAAAACwAADKQgAAh0KwAADKQgAAh0IgAADIQrAAAJ5CAACHQrAAAJ5CAACHQiAAAAAAIAAAAACwAACYQgAAh0KwAACYQgAAh0IgAADIQrAAAAxCAACHQrAAAAxCAACHQiAAAAAAIAAAAAABdxhN+AAAAFZFUlNJT049MQBIRUFEX1RZUEU9TEFTRVIAVElNRV9DT1NUPTUuMzIAVFJBVkVMX0RJU1Q9Nzk4LjE3AE1BWF9YPTE0NS4yMABNQVhfWT0xMTcuMjAATUFYX1o9MC4yMABNQVhfUj0xNzIuMTkARklMQU1FTlRfVVNFRD0wLjAwAENSRUFURURfQVQ9MjAxOC0xMC0xOVQwNjo0MTo1MloAQVVUSE9SPW1hYwBTT0ZUV0FSRT1mbHV4Y2xpZW50LTIuMS4wLUZTAE9CSkVDVF9IRUlHSFQ9MC4wAEhFSUdIVF9PRkZTRVQ9MC4wAEJBQ0tMQVNIPVkAnAg6MwkcAACJUE5HDQoaCgAAAA1JSERSAAADwAAAAlgIBgAAAK2UjwEAABvQSURBVHic7dwxch1HmoXR1ESZ5aeLFZSjDWABvQcuBcCeegHgAmQwzSqn3fTLx1hkUD2gpKkSmUzdc6yJGH4POcTv3Oab/uXh4eHt4eGhXHWeZ1nXVa+/5D//+U9xf/pRvfvTuz99au/+9O5Pn9qXx8fHtzs+ffqk11/29PQ09Ofrs3v3px/Zuz/9yN796Uf27k8/qn9+fn77n+vTGQAAAOZhAAMAABDBAAYAACCCAQwAAEAEAxgAAIAIBjAAAAARDGAAAAAiGMAAAABEMIABAACIYAADAAAQwQAGAAAgggEMAABABAMYAACACAYwAAAAEZbzPEtr7fIH7Pt+6wHHceiD+967+9MP692ffmTv/vQje/enH9m7P/2ovvdelnVdy7Zttx6h119Va536/fq5e/end3/61N796d2fPrGvtfoKNAAAABkMYAAAACIYwAAAAEQwgAEAAIhgAAMAABDBAAYAACCCAQwAAEAEAxgAAIAIBjAAAAARDGAAAAAiGMAAAABEMIABAACIYAADAAAQwQAGAAAgwnKeZ2mtXf6Afd9vPeBufxyHfuK+9+7+9MN696cf2bs//cje/elH9u5PP6rvvZdlXdeybdutR+j1V9Vap36/fu7e/endnz61d39696dP7GutvgINAABABgMYAACACAYwAAAAEQxgAAAAIhjAAAAARDCAAQAAiGAAAwAAEMEABgAAIIIBDAAAQAQDGAAAgAgGMAAAABEMYAAAACIYwAAAAEQwgAEAAIiwnOdZWmuXP2Df91sPGN0fx6Ef2Pfe3Z9+WO/+5v79zd67v7l/f7P37m/u39/svfub+/c3c997L8u6rmXbtluP0OuvqrVO/X793L3707s/fWrv/vTuT5/Y11p9BRoAAIAMBjAAAAARDGAAAAAiGMAAAABEMIABAACIYAADAAAQwQAGAAAgggEMAABABAMYAACACAYwAAAAEQxgAAAAIhjAAAAARDCAAQAAiGAAAwAAEGE5z7O01i5/wL7vtx4we38ch/6G3rv7u2H072/23v25v5G9+3N/I3v35/5G9u7P/Y3qe+9lWde1bNt26xF6/VW11qnfr5+7d39696dP7d2f3v3pE/taq69AAwAAkMEABgAAIIIBHOS3334rv/32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',
        status : {
            RAW                     : -10,
            SCAN                    : -2,
            MAINTAIN                : -1,
            IDLE                    : 0,
            INIT                    : 1,
            STARTING                : 4,
            RESUME_TO_STARTING      : 6,
            RUNNING                 : 16,
            RESUME_TO_RUNNING       : 18,
            PAUSED                  : 32,
            PAUSED_FROM_STARTING    : 36,
            PAUSING_FROM_STARTING   : 38,
            PAUSED_FROM_RUNNING     : 48,
            PAUSING_FROM_RUNNING    : 50,
            COMPLETED               : 64,
            COMPLETING              : 66,
            ABORTED                 : 128
        }
    };
});

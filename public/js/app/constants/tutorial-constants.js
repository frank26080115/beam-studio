define([
    'app/actions/beambox/constant',
    'helpers/i18n'
], function(
    Constant,
    i18n,
) {
    'use strict';
    const LANG = i18n.lang.tutorial;

    const nextStepRequirements = {
        SELECT_CIRCLE: 'SELECT_CIRCLE',
        SELECT_RECT: 'SELECT_RECT',
        DRAW_A_CIRCLE: 'DRAW_A_CIRCLE',
        DRAW_A_RECT: 'DRAW_A_RECT',
        INFILL: 'INFILL',
        SET_PRESET: 'SET_PRESET',
        ADD_NEW_LAYER: 'ADD_NEW_LAYER',
        TO_LAYER_PANEL: 'TO_LAYER_PANEL',
        TO_PREVIEW_MODE: 'TO_PREVIEW_MODE',
        PREVIEW_PLATFORM: 'PREVIEW_PLATFORM',
        SEND_FILE: 'SEND_FILE',
    };
    const callbackConstants = {
        SELECT_DEFAULT_RECT: 'SELECT_DEFAULT_RECT'
    }

    const isMac = process.platform === 'darwin';

    return {
        callbackConstants,
        ...nextStepRequirements,
        NEW_USER_TUTORIAL: {
            id: 'NEW_USER_TUTORIAL',
            end_alert: LANG.newUser.end_alert,
            dialogStylesAndContents: [
                {
                    dialogBoxStyles: {
                        position: {left: 56, top: 258}
                    },
                    holePosition: {left: 7, top: 248},
                    holeSize: {width: 36, height: 36},
                    hintCircle: {left: 5, top: 241, width: 40, height: 40},
                    text: LANG.newUser.draw_a_circle,
                    nextStepRequirement: nextStepRequirements.SELECT_CIRCLE,
                },
                {
                    dialogBoxStyles: {
                        position: {left: window.innerWidth - Constant.rightPanelWidth, top: 300},
                    },
                    holePosition: {left: 50, right: 240, top: 40},
                    holeSize: {},
                    hintCircle: {left: 55, top: 45, width: window.innerWidth - Constant.sidePanelsWidth - 10, height: window.innerHeight - Constant.topBarHeight - 10},
                    text: LANG.newUser.drag_to_draw,
                    nextStepRequirement: nextStepRequirements.DRAW_A_CIRCLE,
                },
                {
                    dialogBoxStyles: {
                        position: {right: 50 + Constant.rightPanelScrollBarWidth, top: 302},
                        arrowDirection:'right'
                    },
                    holePosition: {right: 15, top: 290},
                    holeSize: {width: 30 + Constant.rightPanelScrollBarWidth, height: 20},
                    hintCircle: {right: 9, top: 282, width: 40 + Constant.rightPanelScrollBarWidth, height: 40},
                    text: LANG.newUser.infill,
                    nextStepRequirement: nextStepRequirements.INFILL
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth + 3, top: Constant.topBarHeightWithoutTitleBar + 20},
                        arrowDirection:'right'
                    },
                    holePosition: {right: Constant.rightPanelWidth - 32, top: Constant.topBarHeightWithoutTitleBar},
                    holeSize: {width: 32, height: 40},
                    hintCircle: {right: Constant.rightPanelWidth - 37, top: Constant.topBarHeightWithoutTitleBar, width: 40, height: 40},
                    text: LANG.newUser.switch_to_layer_panel,
                    nextStepRequirement: nextStepRequirements.TO_LAYER_PANEL,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth - 2, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 110},
                        arrowDirection:'right'
                    },
                    holePosition: {right: 15, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 95},
                    holeSize: {width: Constant.rightPanelWidth - 22, height: 30},
                    hintCircle: {right: 5, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 91, width: Constant.rightPanelWidth - 12, height: 40},
                    text: LANG.newUser.set_preset_engraving,
                    nextStepRequirement: nextStepRequirements.SET_PRESET
                },
                {
                    dialogBoxStyles: {
                        position: {right: 40 + Constant.rightPanelScrollBarWidth, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 22},
                        arrowDirection:'right'
                    },
                    holePosition: {right: 15, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 10},
                    holeSize: {width: 20 + Constant.rightPanelScrollBarWidth, height: 20},
                    hintCircle: {right: 14, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 9, width: 25 + Constant.rightPanelScrollBarWidth, height: 25},
                    text: LANG.newUser.add_new_layer,
                    nextStepRequirement: nextStepRequirements.ADD_NEW_LAYER
                },
                {
                    dialogBoxStyles: {
                        position: {left: 56, top: 208}
                    },
                    holePosition: {left: 7, top: 198},
                    holeSize: {width: 36, height: 36},
                    hintCircle: {left: 5, top: 192, width: 40, height: 40},
                    text: LANG.newUser.draw_a_rect,
                    nextStepRequirement: nextStepRequirements.SELECT_RECT,
                },
                {
                    dialogBoxStyles: {
                        position: {left: window.innerWidth - Constant.rightPanelWidth, top: 300},
                    },
                    holePosition: {left: 50, right: 240, top: 40},
                    holeSize: {},
                    hintCircle: {left: 55, top: 45, width: window.innerWidth - Constant.sidePanelsWidth - 10, height: window.innerHeight - Constant.topBarHeight - 10},
                    text: LANG.newUser.drag_to_draw,
                    nextStepRequirement: nextStepRequirements.DRAW_A_RECT,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth + 3, top: Constant.topBarHeightWithoutTitleBar + 20},
                        arrowDirection:'right'
                    },
                    holePosition: {right: Constant.rightPanelWidth - 32, top: Constant.topBarHeightWithoutTitleBar},
                    holeSize: {width: 32, height: 40},
                    hintCircle: {right: Constant.rightPanelWidth - 37, top:Constant.topBarHeightWithoutTitleBar, width: 40, height: 40},
                    text: LANG.newUser.switch_to_layer_panel,
                    nextStepRequirement: nextStepRequirements.TO_LAYER_PANEL,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth - 2, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 110},
                        arrowDirection:'right'
                    },
                    holePosition: {right: 15, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 95},
                    holeSize: {width: Constant.rightPanelWidth - 22, height: 30},
                    hintCircle: {right: 5, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 91, width: Constant.rightPanelWidth - 12, height: 40},
                    text: LANG.newUser.set_preset_cut,
                    nextStepRequirement: nextStepRequirements.SET_PRESET
                },
                {
                    dialogBoxStyles: {
                        position: {left: isMac ? 100 : 25, top: 50},
                        arrowDirection:'top',
                        arrowPadding: isMac ? undefined : 9
                    },
                    holePosition: {left: isMac ? 80 : 3, top: 0},
                    holeSize: {width: 40, height: 40},
                    hintCircle: {left: isMac ? 82 : 7, top: 3, width: 36, height: 36},
                    text: LANG.newUser.switch_to_preview_mode,
                    nextStepRequirement: nextStepRequirements.TO_PREVIEW_MODE
                },
                {
                    dialogBoxStyles: {
                        position: {left: window.innerWidth - Constant.rightPanelWidth, top: 300},
                    },
                    holePosition: {left: 50, right: 240, top: 0},
                    holeSize: {},
                    hintCircle: {left: 55, top: 45, width: window.innerWidth - Constant.sidePanelsWidth - 10, height: window.innerHeight - Constant.topBarHeight - 10},
                    text: LANG.newUser.preview_the_platform,
                    nextStepRequirement: nextStepRequirements.PREVIEW_PLATFORM,
                },
                {
                    dialogBoxStyles: {
                        position: {right: 20, top: 40},
                        arrowDirection:'top',
                        arrowPadding: 7
                    },
                    holePosition: {left: 0, top: 0},
                    holeSize: {},
                    hintCircle: {right: 3, top: 3, width: isMac ? 36 : 64, height: isMac ? 36 : 33},
                    text: LANG.newUser.send_the_file,
                    nextStepRequirement: nextStepRequirements.SEND_FILE
                },
            ]
        },
        INTERFACE_TUTORIAL: {
            id: 'INTERFACE_TUTORIAL',
            hasNextButton: true,
            end_alert: LANG.newInterface.end_alert,
            dialogStylesAndContents: [
                {
                    dialogBoxStyles: {
                        position: {left: isMac ? 100 : 25, top: 50},
                        arrowDirection:'top',
                        arrowPadding: isMac ? undefined : 9
                    },
                    hintCircle: {left: isMac ? 82 : 7, top: 3, width: 36, height: 36},
                    text: LANG.newInterface.camera_preview,
                },
                {
                    dialogBoxStyles: {
                        position: {left: 56, top: Constant.topBarHeightWithoutTitleBar + 40}
                    },
                    hintCircle: {left: 5, top: Constant.topBarHeightWithoutTitleBar + 5, width: 40, height: 135},
                    text: LANG.newInterface.select_image_text,
                },
                {
                    dialogBoxStyles: {
                        position: {left: 56, top: Constant.topBarHeightWithoutTitleBar + 175}
                    },
                    hintCircle: {left: 5, top: Constant.topBarHeightWithoutTitleBar + 150, width: 40, height: 190},
                    text: LANG.newInterface.basic_shapes,
                },
                {
                    dialogBoxStyles: {
                        position: {left: 56, top: Constant.topBarHeightWithoutTitleBar + 370}
                    },
                    hintCircle: {left: 5, top: Constant.topBarHeightWithoutTitleBar + 350, width: 40, height: 40},
                    text: LANG.newInterface.pen_tool,
                },
                {
                    dialogBoxStyles: {
                        position: {right: 40 + Constant.rightPanelScrollBarWidth, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 22},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 14, top: Constant.topBarHeightWithoutTitleBar + Constant.layerListHeight + 9, width: 25 + Constant.rightPanelScrollBarWidth, height: 25},
                    text: LANG.newInterface.add_new_layer,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth - 30, top: 100},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 50 + Constant.rightPanelScrollBarWidth, top: 82, width: 155, height: 36},
                    text: LANG.newInterface.rename_by_double_click,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 100},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 10, top: 82, width: Constant.rightPanelWidth - 15, height: 36},
                    text: LANG.newInterface.drag_to_sort,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 100},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 10, top: 82, width: Constant.rightPanelWidth - 15, height: 236},
                    text: LANG.newInterface.layer_controls,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 60},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 5, top: 42, width: Constant.rightPanelWidth - 10, height: 36},
                    text: LANG.newInterface.switch_between_layer_panel_and_object_panel,
                    callback: callbackConstants.SELECT_DEFAULT_RECT
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 100},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 10, top: 82, width: Constant.rightPanelWidth - 15, height: 36},
                    text: LANG.newInterface.align_controls,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 140},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: Constant.rightPanelWidth - 70, top: 123, width: 65, height: 36},
                    text: LANG.newInterface.group_controls,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 140},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: Constant.rightPanelScrollBarWidth + 5, top: 123, width: 115, height: 36},
                    text: LANG.newInterface.shape_operation,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelScrollBarWidth + 95, top: 230},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: Constant.rightPanelScrollBarWidth + 25, top: 213, width: 66, height: 34},
                    text: LANG.newInterface.flip,
                },
                {
                    dialogBoxStyles: {
                        position: {right: Constant.rightPanelWidth, top: 273},
                        arrowDirection:'right'
                    },
                    hintCircle: {right: 5, top: 256, width: Constant.rightPanelWidth - 10, height: 180},
                    text: LANG.newInterface.object_actions,
                },
            ]
        }
    };
});

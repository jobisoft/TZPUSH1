"use strict";

Components.utils.import("chrome://tbsync/content/tbsync.jsm");

var tbSyncAccountManager = {

    onload: function () {
        tbSyncAccountManager.selectTab(0);

        // do we need to show the update button?        
        let updateBeta = tbSync.prefSettings.getBoolPref("notify4beta") && (tbSync.cmpVersions(tbSync.versionInfo.beta, tbSync.versionInfo.installed) > 0);
        let updateStable = (tbSync.cmpVersions(tbSync.versionInfo.stable, tbSync.versionInfo.installed)> 0);
        document.getElementById("tbSyncAccountManager.t5").hidden = !(updateBeta || updateStable);
    },
    
    onunload: function () {
        tbSync.prefWindowObj = null;
    },

    selectTab: function (t) {
        const LOAD_FLAGS_NONE = Components.interfaces.nsIWebNavigation.LOAD_FLAGS_NONE;
        let sources = ["accounts.xul", "cape.xul", "catman.xul", "supporter.xul", "help.xul", "update.xul"];

        //set active tab (css selector for background color)
        for (let i=0; i<sources.length; i++) {            
            if (i==t) document.getElementById("tbSyncAccountManager.t" + i).setAttribute("active","true");
            else document.getElementById("tbSyncAccountManager.t" + i).setAttribute("active","false");
        }
        
        //load XUL
        document.getElementById("tbSyncAccountManager.contentWindow").webNavigation.loadURI("chrome://tbsync/content/manager/"+sources[t], LOAD_FLAGS_NONE, null, null, null);
    },
    
    getLogPref: function() {
        let log = document.getElementById("tbSyncAccountManager.logPrefCheckbox");
        log.checked =  tbSync.prefSettings.getBoolPref("log.tofile");
    },
    
    toggleLogPref: function() {
        let log = document.getElementById("tbSyncAccountManager.logPrefCheckbox");
        tbSync.prefSettings.setBoolPref("log.tofile", log.checked);
    }
};

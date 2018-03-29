"use strict";

Components.utils.import("chrome://tbsync/content/tbsync.jsm");

var tbSyncAccountSettings = {

    selectedAccount: null,
    init: false,
    switchMode: "on",
    updateTimer: Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer),

    onload: function () {
        //get the selected account from the loaded URI
        tbSyncAccountSettings.selectedAccount = window.location.toString().split("id=")[1];
        tbSync.prepareSyncDataObj(tbSyncAccountSettings.selectedAccount);

        tbSyncAccountSettings.loadSettings();
        
        let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(tbSyncAccountSettings.syncstateObserver, "tbsync.changedSyncstate", false);
        observerService.addObserver(tbSyncAccountSettings.updateGuiObserver, "tbsync.updateAccountSettingsGui", false);
        tbSyncAccountSettings.init = true;
    },

    onunload: function () {
        tbSyncAccountSettings.updateTimer.cancel();
        let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        if (tbSyncAccountSettings.init) {
            observerService.removeObserver(tbSyncAccountSettings.syncstateObserver, "tbsync.changedSyncstate");
            observerService.removeObserver(tbSyncAccountSettings.updateGuiObserver, "tbsync.updateAccountSettingsGui");
        }
    },

    // manage sync via queue
    requestSync: function (job, account) {
        if (!document.getElementById('tbsync.accountsettings.syncbtn').disabled) tbSync.syncAccount('sync', tbSyncAccountSettings.selectedAccount);
    },


    deleteFolder: function() {
        let folderList = document.getElementById("tbsync.accountsettings.folderlist");
        if (folderList.selectedItem !== null && !folderList.disabled) {
            let fID =  folderList.selectedItem.value;
            let folder = tbSync.db.getFolder(tbSyncAccountSettings.selectedAccount, fID, true);

            //only trashed folders can be purged (for example O365 does not show deleted folders but also does not allow to purge them)
            if (!tbSync.eas.parentIsTrash(tbSyncAccountSettings.selectedAccount, folder.parentID)) return;
            
            if (folder.selected == "1") alert(tbSync.getLocalizedMessage("deletefolder.notallowed::" + folder.name,"eas"));
            else if (confirm(tbSync.getLocalizedMessage("deletefolder.confirm::" + folder.name,"eas"))) {
                tbSync.syncAccount("deletefolder", tbSyncAccountSettings.selectedAccount, fID);
            } 
        }            
    },
    
    /* * *
    * Run through all defined TbSync settings and if there is a corresponding
    * field in the settings dialog, fill it with the stored value.
    */
    loadSettings: function () {
        let settings = tbSync.eas.getAccountStorageFields();
        let servertype = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "servertype");
        let fixedSettings = tbSync.eas.getFixedServerSettings(servertype);

        for (let i=0; i<settings.length;i++) {
            if (document.getElementById("tbsync.accountsettings." + settings[i])) {
                //is this a checkbox?
                if (document.getElementById("tbsync.accountsettings." + settings[i]).tagName == "checkbox") {
                    //BOOL
                    if (tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, settings[i])  == "1") document.getElementById("tbsync.accountsettings." + settings[i]).checked = true;
                    else document.getElementById("tbsync.accountsettings." + settings[i]).checked = false;
                    
                } else {
                    //Not BOOL
                    document.getElementById("tbsync.accountsettings." + settings[i]).value = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, settings[i]);
                    
                }
                
                if (fixedSettings.hasOwnProperty(settings[i])) document.getElementById("tbsync.accountsettings." + settings[i]).disabled = true;
                else document.getElementById("tbsync.accountsettings." + settings[i]).disabled = false;
                
            }
        }
        
        // special treatment for configuration label
        document.getElementById("tbsync.accountsettings.config.label").value= tbSync.getLocalizedMessage("config." + servertype);
        
        // also load DeviceId
        document.getElementById('deviceId').value = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "deviceId");
        
        this.updateGui();
    },


    instantSaveSetting: function (field) {
        let setting = field.id.replace("tbsync.accountsettings.","");
        let value = "";
        
        if (field.tagName == "checkbox") {
            if (field.checked) value = "1";
            else value = "0";
        } else {
            value = field.value;
        }
        tbSync.db.setAccountSetting(tbSyncAccountSettings.selectedAccount, setting, value);
        
        if (setting == "accountname") {
            let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
            observerService.notifyObservers(null, "tbsync.changedAccountName", tbSyncAccountSettings.selectedAccount + ":" + field.value);
        }
        tbSync.db.saveAccounts(); //write modified accounts to disk
    },


    stripHost: function () {
        let host = document.getElementById('tbsync.accountsettings.host').value;
        if (host.indexOf("https://") == 0) {
            host = host.replace("https://","");
            document.getElementById('tbsync.accountsettings.https').checked = true;
            tbSync.db.setAccountSetting(tbSyncAccountSettings.selectedAccount, "https", "1");
        } else if (host.indexOf("http://") == 0) {
            host = host.replace("http://","");
            document.getElementById('tbsync.accountsettings.https').checked = false;
            tbSync.db.setAccountSetting(tbSyncAccountSettings.selectedAccount, "https", "0");
        }
        
        while (host.endsWith("/")) { host = host.slice(0,-1); }        
        document.getElementById('tbsync.accountsettings.host').value = host
        tbSync.db.setAccountSetting(tbSyncAccountSettings.selectedAccount, "host", host);
    },

    unlockSettings: function () {
        if (confirm(tbSync.getLocalizedMessage("prompt.UnlockSettings"))) {
            tbSync.db.setAccountSetting(tbSyncAccountSettings.selectedAccount, "servertype", "custom");
            this.loadSettings();
        }
    },

    updateGuiObserver: {
        observe: function (aSubject, aTopic, aData) {
            //only update if request for this account
            if (aData == tbSyncAccountSettings.selectedAccount) {
                tbSyncAccountSettings.loadSettings();
                let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
                observerService.notifyObservers(null, "tbsync.changedSyncstate", aData);
            }
        }
    },

    updateGui: function () {
        let status = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "status");
        let state = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "state"); //enabled, disabled
        let numberOfFoundFolders = Object.keys(tbSync.db.getFolders(tbSyncAccountSettings.selectedAccount)).length;      
        let neverLockedFields = ["autosync"];
        
        let isConnected = (state == "enabled" && numberOfFoundFolders > 0);
        let isSyncing = (status == "syncing" || tbSync.isSyncing(tbSyncAccountSettings.selectedAccount));
        let hideOptions = isConnected && tbSyncAccountSettings.switchMode == "on";
        
        //which box is to be displayed? options or folders
        document.getElementById("tbsync.accountsettings.config.unlock").hidden = (state == "enabled" || tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "servertype") == "custom"); 
        document.getElementById("tbsync.accountsettings.options").hidden = hideOptions;
        document.getElementById("tbsync.accountsettings.server").hidden = hideOptions;
        document.getElementById("tbsync.accountsettings.folders").hidden = !hideOptions;

        //disable settings if connected
        let settings = tbSync.eas.getAccountStorageFields();
        let servertype = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "servertype");
        let fixedSettings = tbSync.eas.getFixedServerSettings(servertype);
        for (let i=0; i<settings.length;i++) {
            if (neverLockedFields.includes(settings[i])) continue;
            if (document.getElementById("tbsync.accountsettings." + settings[i])) document.getElementById("tbsync.accountsettings." + settings[i]).disabled = (isConnected || isSyncing || fixedSettings.hasOwnProperty(settings[i])); 
            if (document.getElementById("tbsync.accountsettingslabel." + settings[i])) document.getElementById("tbsync.accountsettingslabel." + settings[i]).disabled = isConnected || isSyncing; 
        }

        //change color and boldness of labels, to direct users focus to the sync status
        document.getElementById("tbsync.accountsettings.config.label").style["color"] = isConnected || isSyncing ? "darkgrey" : "black";
        document.getElementById("tbsync.accountsettings.contacts.label").style["color"] = isConnected || isSyncing ? "darkgrey" : "black";
        
        this.updateSyncstate();
        this.updateFolderList();
    },


    updateSyncstate: function () {        
        tbSyncAccountSettings.updateTimer.cancel();

        // if this account is beeing synced, display syncstate, otherwise print status
        let status = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "status");
        let state = tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "state"); //enabled, disabled

        document.getElementById('syncstate_link').textContent = "";
        document.getElementById('syncstate_link').setAttribute("dest", "");

        let isSyncing = (status == "syncing" || tbSync.isSyncing(tbSyncAccountSettings.selectedAccount));
        let numberOfFoundFolders = Object.keys(tbSync.db.getFolders(tbSyncAccountSettings.selectedAccount)).length;
        let isConnected = (state == "enabled" && numberOfFoundFolders > 0);
        
        if (isSyncing) {
            tbSyncAccountSettings.switchMode = "on";
            let syncdata = tbSync.getSyncData(tbSyncAccountSettings.selectedAccount);
            let accounts = tbSync.db.getAccounts().data;
            let target = "";

            if (accounts.hasOwnProperty(syncdata.account) && syncdata.folderID !== "" && syncdata.state != "done") { //if "Done" do not print folder info syncstate
                target = " [" + tbSync.db.getFolderSetting(syncdata.account, syncdata.folderID, "name") + "]";
            }
            
            let parts = syncdata.state.split("||");
            let syncstate = parts[0];
            let synctime = (parts.length>1 ? parts[1] : Date.now());

            let diff = Date.now() - synctime;
            let msg = tbSync.getLocalizedMessage("syncstate." + syncstate, "eas");
            if (diff > 2000) msg = msg + " (" + Math.round((tbSync.prefSettings.getIntPref("eas.timeout") - diff)/1000) + "s)";

            document.getElementById('syncstate').textContent = msg + target;
        
            if (syncstate.split(".")[0] == "send") {
                //re-schedule update, if this is a waiting syncstate
                tbSyncAccountSettings.updateTimer.init(tbSyncAccountSettings.updateSyncstate, 1000, 0);
            }

            //we are syncing, either still connection or indeed syncing
            if (numberOfFoundFolders > 0) document.getElementById('tbsync.accountsettings.syncbtn').label = tbSync.getLocalizedMessage("status.syncing");
            else document.getElementById('tbsync.accountsettings.syncbtn').label = tbSync.getLocalizedMessage("status.connecting");            

            //do not display slider while syncing
            document.getElementById('tbsync.accountsettings.slider').hidden = true;
            
        } else {
            let localized = tbSync.getLocalizedMessage("status." + status);
            if (state != "enabled") localized = tbSync.getLocalizedMessage("status." + "disabled");

            //check, if this localized string contains a link
            let parts = localized.split("||");
            document.getElementById('syncstate').textContent = parts[0];
            if (parts.length==3) {
                    document.getElementById('syncstate_link').setAttribute("dest", parts[1]);
                    document.getElementById('syncstate_link').textContent = parts[2];
            }
            
            if (numberOfFoundFolders > 0) document.getElementById('tbsync.accountsettings.syncbtn').label = tbSync.getLocalizedMessage("button.syncthis");            
            else document.getElementById('tbsync.accountsettings.syncbtn').label = tbSync.getLocalizedMessage("button.tryagain");            

            //do not display slider if not connected
            document.getElementById('tbsync.accountsettings.slider').hidden = !isConnected;
            document.getElementById('tbsync.accountsettings.slider').src = "chrome://tbsync/skin/slider-"+tbSyncAccountSettings.switchMode+".png";
        
        }

        //disable enable/disable btn, sync btn and folderlist during sync, also hide sync button if disabled
        document.getElementById('tbsync.accountsettings.enablebtn').disabled = isSyncing;
        document.getElementById('tbsync.accountsettings.folderlist').disabled = isSyncing;
        document.getElementById('tbsync.accountsettings.syncbtn').disabled = isSyncing;
        
        document.getElementById('tbsync.accountsettings.syncbtn').hidden = !(state == "enabled" && tbSyncAccountSettings.switchMode == "on");
        document.getElementById('tbsync.accountsettings.enablebtn').hidden = (state == "enabled" && tbSyncAccountSettings.switchMode == "on");

        if (state == "enabled") document.getElementById('tbsync.accountsettings.enablebtn').label = tbSync.getLocalizedMessage("button.disableAndEdit");
        else document.getElementById('tbsync.accountsettings.enablebtn').label = tbSync.getLocalizedMessage("button.enableAndConnect");
    },


    toggleFolder: function () {
        let folderList = document.getElementById("tbsync.accountsettings.folderlist");
        if (folderList.selectedItem !== null && !folderList.disabled) {
            let fID =  folderList.selectedItem.value;
            let folder = tbSync.db.getFolder(tbSyncAccountSettings.selectedAccount, fID, true);

            if (folder.selected == "1") {
                if (window.confirm(tbSync.getLocalizedMessage("prompt.Unsubscribe"))) {
                    //deselect folder
                    folder.selected = "0";
                    //remove folder, which will trigger the listener in tbsync which will clean up everything
                    tbSync.eas.removeTarget(folder.target, folder.type); 
                }
            } else {
                //select and update status
                tbSync.db.setFolderSetting(tbSyncAccountSettings.selectedAccount, fID, "selected", "1");
                tbSync.db.setFolderSetting(tbSyncAccountSettings.selectedAccount, fID, "status", "aborted");
                tbSync.db.setAccountSetting(folder.account, "status", "notsyncronized");
                let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
                observerService.notifyObservers(null, "tbsync.changedSyncstate", tbSyncAccountSettings.selectedAccount);
                this.updateSyncstate();
            }
            this.updateFolderList();
        }
    },

    updateMenuPopup: function () {
        let folderList = document.getElementById("tbsync.accountsettings.folderlist");
        let hideContextMenuDelete = true;
        let hideContextMenuToggleSubscription = true;

        if (!folderList.disabled && folderList.selectedItem !== null && folderList.selectedItem.value !== undefined) {
            let fID =  folderList.selectedItem.value;
            let folder = tbSync.db.getFolder(tbSyncAccountSettings.selectedAccount, fID, true);

            //if any folder is selected, also show ContextMenuToggleSubscription
            hideContextMenuToggleSubscription = false;
            if (folder.selected == "1") {
                document.getElementById("tbsync.accountsettings.ContextMenuToggleSubscription").label = tbSync.getLocalizedMessage("subscribe.off::" + folder.name, "eas");
            } else {
                document.getElementById("tbsync.accountsettings.ContextMenuToggleSubscription").label = tbSync.getLocalizedMessage("subscribe.on::" + folder.name, "eas");
            }
            
            //if a folder in trash is selected, also show ContextMenuDelete (but only if FolderDelete is allowed)
            if (tbSync.eas.parentIsTrash(tbSyncAccountSettings.selectedAccount, folder.parentID) && tbSync.db.getAccountSetting(tbSyncAccountSettings.selectedAccount, "allowedEasCommands").split(",").includes("FolderDelete")) {// folder in recycle bin
                hideContextMenuDelete = false;
                document.getElementById("tbsync.accountsettings.ContextMenuDelete").label = tbSync.getLocalizedMessage("deletefolder.menuentry::" + folder.name, "eas");
            }
        }
        
        document.getElementById("tbsync.accountsettings.ContextMenuDelete").hidden = hideContextMenuDelete;
        document.getElementById("tbsync.accountsettings.ContextMenuToggleSubscription").hidden = hideContextMenuToggleSubscription;
    },

    getTypeImage: function (type) {
        let src = ""; 
        switch (type) {
            case "7":
            case "15":
                src = "todo16.png";
                break;
            case "8":
            case "13":
                src = "calendar16.png";
                break;
            case "9":
            case "14":
                src = "contacts16.png";
                break;
        }
        return "chrome://tbsync/skin/" + src;
    },

    getIdChain: function (allowedTypesOrder, account, folderID) {
        //create sort string so that child folders are directly below their parent folders, different folder types are grouped and trashes folders at the end
        let folder = folderID;
        let parent =  tbSync.db.getFolder(account, folderID).parentID;
        let chain = folder.toString().padStart(3,"0");
        
        while (parent && parent != "0") {
            chain = parent.toString().padStart(3,"0") + "." + chain;
            folder = parent;
            parent = tbSync.db.getFolder(account, folder).parentID;
        };
        
        let pos = allowedTypesOrder.indexOf(tbSync.db.getFolder(account, folder).type);
        chain = (pos == -1 ? "U" : pos).toString().padStart(3,"0") + "." + chain;
        return chain;
    },    

    updateFolderList: function () {
        //do not update folder list, if not visible
        if (document.getElementById("tbsync.accountsettings.folders").hidden) return;
        
        let folderList = document.getElementById("tbsync.accountsettings.folderlist");
        let folders = tbSync.db.getFolders(tbSyncAccountSettings.selectedAccount);
        
        //sort by specified order, trashed folders are moved to the end
        let allowedTypesOrder = ["9","14","8","13","7","15"];
        let folderIDs = Object.keys(folders).sort((a, b) => (this.getIdChain(allowedTypesOrder, tbSyncAccountSettings.selectedAccount, a).localeCompare(this.getIdChain(allowedTypesOrder, tbSyncAccountSettings.selectedAccount, b))));

        //get current accounts in list and remove entries of accounts no longer there
        let listedfolders = [];
        for (let i=folderList.getRowCount()-1; i>=0; i--) {
            listedfolders.push(folderList.getItemAtIndex (i).value); 
            if (folderIDs.indexOf(folderList.getItemAtIndex(i).value) == -1) {
                folderList.removeItemAt(i);
            }
        }

        //listedFolders contains the folderIDs, in the current list (aa,bb,cc,dd)
        //folderIDs contains a list of folderIDs with potential new items (aa,ab,bb,cc,cd,dd, de) - the existing ones must be updated - the new ones must be added at their desired location 
        //walking backwards! after each item update lastCheckdEntry (null at the beginning)
        // - de? add via append (because lastChecked is null)
        // - dd? update
        // - cd? insert before lastChecked (dd)
        // - cc? update
        // - bb? update
        // - ab? insert before lastChecked (bb)
        // - aa? update
        
        // add/update allowed folder based on type (check https://msdn.microsoft.com/en-us/library/gg650877(v=exchg.80).aspx)
        // walk backwards, so adding items does not mess up index
        let lastCheckedEntry = null;

        for (let i = folderIDs.length-1; i >= 0; i--) {
            if (allowedTypesOrder.indexOf(folders[folderIDs[i]].type) != -1) { 
                let selected = (folders[folderIDs[i]].selected == "1");
                let type = folders[folderIDs[i]].type;
                let status = (selected) ? folders[folderIDs[i]].status : "";
                let name = folders[folderIDs[i]].name ;
                if (tbSync.eas.parentIsTrash(tbSyncAccountSettings.selectedAccount, folders[folderIDs[i]].parentID)) name = tbSync.getLocalizedMessage("recyclebin","eas")+" | "+name;

                //if status OK, print target
                if (selected) {
                    switch (status) {
                        case "OK":
                        case "modified":
                            if (type == "7" || type == "15" || type == "8" || type == "13") {
                                if ("calICalendar" in Components.interfaces) status = tbSync.getLocalizedMessage("status." + status) + ": "+ tbSync.getCalendarName(folders[folderIDs[i]].target);
                                else status = tbSync.getLocalizedMessage("status.nolightning");
                            }
                            if (type == "9" || type == "14") status = tbSync.getLocalizedMessage("status." + status) + ": "+ tbSync.getAddressBookName(folders[folderIDs[i]].target);
                            break;
                        case "pending":
                            let syncdata = tbSync.getSyncData(tbSyncAccountSettings.selectedAccount);
                            status = tbSync.getLocalizedMessage("status." + status);
                            if (folderIDs[i] == syncdata.folderID) {
                                status = tbSync.getLocalizedMessage("status.syncing");
                                if (["send","eval","prepare"].includes(syncdata.state.split(".")[0]) && (syncdata.todo + syncdata.done) > 0) status = status + " (" + syncdata.done + (syncdata.todo>0 ? "/" + syncdata.todo : "") + ")"; 
                            }
                            status = status + " ...";
                            break;
                        default:
                            status = tbSync.getLocalizedMessage("status." + status);
                    }
                }
                
                if (listedfolders.indexOf(folderIDs[i]) == -1) {

                    //add new entry
                    let newListItem = document.createElement("richlistitem");
                    newListItem.setAttribute("id", "zprefs.folder." + folderIDs[i]);
                    newListItem.setAttribute("value", folderIDs[i]);

                    //add folder type/img
                    let itemTypeCell = document.createElement("listcell");
                    itemTypeCell.setAttribute("class", "img");
                    itemTypeCell.setAttribute("width", "24");
                    itemTypeCell.setAttribute("height", "24");
                        let itemType = document.createElement("image");
                        itemType.setAttribute("src", this.getTypeImage(type));
                        itemType.setAttribute("style", "margin: 4px;");
                    itemTypeCell.appendChild(itemType);
                    newListItem.appendChild(itemTypeCell);

                    //add folder name
                    let itemLabelCell = document.createElement("listcell");
                    itemLabelCell.setAttribute("class", "label");
                    itemLabelCell.setAttribute("width", "145");
                    itemLabelCell.setAttribute("crop", "end");
                    itemLabelCell.setAttribute("label", name);
                    itemLabelCell.setAttribute("tooltiptext", name);
                    itemLabelCell.setAttribute("disabled", !selected);
                    if (!selected) itemLabelCell.setAttribute("style", "font-style:italic;");
                    newListItem.appendChild(itemLabelCell);

                    //add folder status
                    let itemStatusCell = document.createElement("listcell");
                    itemStatusCell.setAttribute("class", "label");
                    itemStatusCell.setAttribute("flex", "1");
                    itemStatusCell.setAttribute("crop", "end");
                    itemStatusCell.setAttribute("label", status);
                    itemStatusCell.setAttribute("tooltiptext", status);
                    newListItem.appendChild(itemStatusCell);

                    //ensureElementIsVisible also forces internal update of rowCount, which sometimes is not updated automatically upon appendChild
                    //we have to now, if appendChild at end or insertBefore
                    if (lastCheckedEntry === null) folderList.ensureElementIsVisible(folderList.appendChild(newListItem));
                    else folderList.ensureElementIsVisible(folderList.insertBefore(newListItem,document.getElementById(lastCheckedEntry)));

                } else {

                    //update entry
                    let item = document.getElementById("zprefs.folder." + folderIDs[i]);
                    
                    this.updateCell(item.childNodes[1], ["label","tooltiptext"], name);
                    this.updateCell(item.childNodes[2], ["label","tooltiptext"], status);
                    if (selected) {
                        this.updateCell(item.childNodes[1], ["style"], "font-style:normal;");
                        this.updateCell(item.childNodes[1], ["disabled"], "false");
                    } else {
                        this.updateCell(item.childNodes[1], ["style"], "font-style:italic;");
                        this.updateCell(item.childNodes[1], ["disabled"], "true");
                    }

                }
                lastCheckedEntry = "zprefs.folder." + folderIDs[i];
            }
        }
    },

    updateCell: function (e, attribs, value) {
        if (e.getAttribute(attribs[0]) != value) {
            for (let i=0; i<attribs.length; i++) {
                e.setAttribute(attribs[i],value);
            }
        }
    },

    switchFoldersAndConfigView: function () {
        if (tbSyncAccountSettings.switchMode == "on") tbSyncAccountSettings.switchMode = "off"; 
        else tbSyncAccountSettings.switchMode = "on";
        tbSyncAccountSettings.updateGui();
    },
    
    updateDisableContextMenu: function () {
        let isSyncing = (status == "syncing" || tbSync.isSyncing(tbSyncAccountSettings.selectedAccount));
        document.getElementById("contextMenuDisableAccount").disabled = isSyncing;
    },
    
    /* * *
    * This function is executed, when the user hits the enable/disable button. On disable, all
    * sync targets are deleted and the settings can be changed again. On enable, a new sync is 
    * initiated.
    */
    toggleEnableState: function () {
        //ignore cancel request, if button is disabled or a sync is ongoing
        if (document.getElementById('tbsync.accountsettings.enablebtn').disabled || tbSync.isSyncing(tbSyncAccountSettings.selectedAccount)) return;

        let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        observerService.notifyObservers(null, "tbsync.toggleEnableState", tbSyncAccountSettings.selectedAccount);
        
    },


    /* * *
    * Observer to catch changing syncstate and to update the status info.
    */    
    syncstateObserver: {
        observe: function (aSubject, aTopic, aData) {
            let account = aData;            
            let msg = null;
            
            //only handle syncstate changes of the active account
            if (account == tbSyncAccountSettings.selectedAccount) {
                
                let state = tbSync.getSyncData(account,"state");
                if (state == "accountdone") {
                        let status = tbSync.db.getAccountSetting(account, "status");
                        switch (status) {
                            case "401":
                                window.openDialog("chrome://tbsync/content/manager/password.xul", "passwordprompt", "centerscreen,chrome,resizable=no", tbSync.db.getAccount(account), function() {tbSync.syncAccount("sync", account);});
                                break;
                            case "OK":
                            case "notsyncronized":
                            case "disabled":
                                //do not pop alert box for these
                                break;
                            default:
                                msg = tbSync.getLocalizedMessage("status." + status);
                        }
                }
                
                if (state == "connected" || state == "syncing" || state == "accountdone") tbSyncAccountSettings.updateGui();
                else {
                    tbSyncAccountSettings.updateFolderList();
                    tbSyncAccountSettings.updateSyncstate();
                }
            }
        }
    }

};

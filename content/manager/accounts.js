"use strict";

Components.utils.import("chrome://tbsync/content/tbsync.jsm");

var tbSyncAccounts = {

    selectedAccount: null,

    onload: function () {
        //scan accounts, update list and select first entry (because no id is passed to updateAccountList)
        //the onSelect event of the List will load the selected account
        this.updateAccountsList(); 
        let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(tbSyncAccounts.updateAccountSyncStateObserver, "tbsync.changedSyncstate", false);
        observerService.addObserver(tbSyncAccounts.updateAccountNameObserver, "tbsync.changedAccountName", false);
        observerService.addObserver(tbSyncAccounts.toggleEnableStateObserver, "tbsync.toggleEnableState", false);
    },

    onunload: function () {
        let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        observerService.removeObserver(tbSyncAccounts.updateAccountSyncStateObserver, "tbsync.changedSyncstate");
        observerService.removeObserver(tbSyncAccounts.updateAccountNameObserver, "tbsync.changedAccountName");
        observerService.removeObserver(tbSyncAccounts.toggleEnableStateObserver, "tbsync.toggleEnableState");
    },


    addAccount: function () {
        //EAS hardcoded, will be made dynamic as soon as different providers are usable
        document.getElementById("tbSyncAccounts.accounts").disabled=true;
        document.getElementById("tbSyncAccounts.btnAccountActions").disabled=true;
        window.openDialog("chrome://tbsync/content/provider/eas/newaccount.xul", "easnewaccount", "centerscreen,modal,resizable=no");
        document.getElementById("tbSyncAccounts.accounts").disabled=false;
        document.getElementById("tbSyncAccounts.btnAccountActions").disabled=false;
    },

    updateDropdown: function (selector) {
        let accountsList = document.getElementById("tbSyncAccounts.accounts");
        let selectedAccount = null;
        let selectedAccountName = "";
        let isSyncing = false;
        let state = "";
        let isActionsDropdown = (selector == "accountActions");
        
        if (accountsList.selectedItem !== null && !isNaN(accountsList.selectedItem.value)) {
            //some item is selected
            let selectedItem = accountsList.selectedItem;
            selectedAccount = selectedItem.value;
            selectedAccountName = selectedItem.getAttribute("label");
            isSyncing = tbSync.isSyncing(selectedAccount);
            state = tbSync.db.getAccountSetting(selectedAccount, "state"); //enabled, disabled
        }
        
        //hide if no accounts are avail (which is identical to no account selected)
        if (isActionsDropdown) document.getElementById(selector + "SyncAllAccounts").hidden = (selectedAccount === null);

        let numberOfFoundFolders = Object.keys(tbSync.db.getFolders(selectedAccount)).length;
        let isConnected = (state == "enabled" && numberOfFoundFolders > 0);
        
        //hide if no account is selected
        if (isActionsDropdown) document.getElementById(selector + "Separator").hidden = (selectedAccount === null);
        document.getElementById(selector + "DeleteAccount").hidden = (selectedAccount === null);
        document.getElementById(selector + "DisableAccount").hidden = (selectedAccount === null) || (state != "enabled");
        document.getElementById(selector + "EnableAccount").hidden = (selectedAccount === null) || (state == "enabled");
        document.getElementById(selector + "SyncAccount").hidden = (selectedAccount === null) || !isConnected;
        document.getElementById(selector + "RetryConnectAccount").hidden = (selectedAccount === null) || isConnected || (state != "enabled");

        //Not yet implemented
        document.getElementById(selector + "ShowSyncLog").hidden = true;//(selectedAccount === null) || (state != "enabled");
        document.getElementById(selector + "ShowSyncLog").disabled = true;
        
        if (selectedAccount !== null) {
            //disable if currently syncing (and displayed)
            document.getElementById(selector + "DeleteAccount").disabled = isSyncing;
            document.getElementById(selector + "DisableAccount").disabled = isSyncing;
            document.getElementById(selector + "EnableAccount").disabled = isSyncing;
            document.getElementById(selector + "SyncAccount").disabled = isSyncing;
            //adjust labels - only in global actions dropdown
            if (isActionsDropdown) document.getElementById(selector + "DeleteAccount").label = tbSync.getLocalizedMessage("accountacctions.delete").replace("##accountname##", selectedAccountName);
            if (isActionsDropdown) document.getElementById(selector + "SyncAccount").label = tbSync.getLocalizedMessage("accountacctions.sync").replace("##accountname##", selectedAccountName);
            if (isActionsDropdown) document.getElementById(selector + "EnableAccount").label = tbSync.getLocalizedMessage("accountacctions.enable").replace("##accountname##", selectedAccountName);
            if (isActionsDropdown) document.getElementById(selector + "DisableAccount").label = tbSync.getLocalizedMessage("accountacctions.disable").replace("##accountname##", selectedAccountName);
        }
        
    },
    
    toggleEnableState: function () {
        let accountsList = document.getElementById("tbSyncAccounts.accounts");
        if (accountsList.selectedItem !== null && !isNaN(accountsList.selectedItem.value) && !tbSync.isSyncing(accountsList.selectedItem.value)) {            
            let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
            observerService.notifyObservers(null, "tbsync.toggleEnableState", accountsList.selectedItem.value);
        }
    },

    synchronizeAccount: function () {
        let accountsList = document.getElementById("tbSyncAccounts.accounts");
        if (accountsList.selectedItem !== null && !isNaN(accountsList.selectedItem.value)  && !tbSync.isSyncing(accountsList.selectedItem.value)) {            
            tbSync.syncAccount('sync', accountsList.selectedItem.value);
        }
    },

    deleteAccount: function () {
        let accountsList = document.getElementById("tbSyncAccounts.accounts");
        if (accountsList.selectedItem !== null && !isNaN(accountsList.selectedItem.value)  && !tbSync.isSyncing(accountsList.selectedItem.value)) {
            let nextAccount =  -1;
            if (accountsList.selectedIndex > 0) {
                //first try to select the item after this one, otherwise take the one before
                if (accountsList.selectedIndex + 1 < accountsList.getRowCount()) nextAccount = accountsList.getItemAtIndex(accountsList.selectedIndex + 1).value;
                else nextAccount = accountsList.getItemAtIndex(accountsList.selectedIndex - 1).value;
            }
            
            if (confirm(tbSync.getLocalizedMessage("prompt.DeleteAccount").replace("##accountName##", accountsList.selectedItem.getAttribute("label")))) {
                //disable (removes ab, triggers changelog cleanup) 
                tbSync[tbSync.db.getAccountSetting(accountsList.selectedItem.value, "provider")].disableAccount(accountsList.selectedItem.value);
                //delete account from db
                tbSync.db.removeAccount(accountsList.selectedItem.value);

                this.updateAccountsList(nextAccount);
            }
        }
    },


    /* * *
    * Observer to catch enable state toggle
    */
    toggleEnableStateObserver: {
        observe: function (aSubject, aTopic, aData) {
            let account = aData;                        
            let state = tbSync.db.getAccountSetting(account, "state"); //enabled, disabled
            let observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

            if (state == "enabled") {
                //we are enabled and want to disable
                let numberOfFoundFolders = Object.keys(tbSync.db.getFolders(account)).length;
                if (numberOfFoundFolders == 0 || window.confirm(tbSync.getLocalizedMessage("prompt.Disable"))) {
                    tbSync[tbSync.db.getAccountSetting(account, "provider")].disableAccount(account);
                    observerService.notifyObservers(null, "tbsync.updateAccountSettingsGui", account);
                }
            } else {
                //we are disabled and want to enabled
                tbSync[tbSync.db.getAccountSetting(account, "provider")].enableAccount(account);
                observerService.notifyObservers(null, "tbsync.updateAccountSettingsGui", account);
                tbSync.syncAccount("sync", account);
            }
                
        }
    },


    /* * *
    * Observer to catch synstate changes and to update account icons
    */
    updateAccountSyncStateObserver: {
        observe: function (aSubject, aTopic, aData) {
            if (aData != "") {
                //limit execution to a couple of states, not all
                let state = tbSync.getSyncData(aData,"state");
                //if (state == "syncing" || state == "accountdone") 
                tbSyncAccounts.updateAccountStatus(aData);
            }
        }
    },

    setStatusImage: function (account, obj) {
        let statusImage = this.getStatusImage(account, obj.src);
        if (statusImage != obj.src) {
            obj.src = statusImage;
        }
    },
    
    getStatusImage: function (account, current = "") {
        let src = "";   
        switch (tbSync.db.getAccountSetting(account, "status")) {
            case "OK":
                if (tbSync.db.getAccountSetting(account, "state") == "enabled") src = "tick16.png";
                else src = "disabled.png";
                break;
            
            case "disabled":
                src = "disabled.png";
                break;
            
            case "notsyncronized":
            case "nolightning":
                src = "warning16.png";
                break;

            case "syncing":
                if (current.indexOf("sync16") == -1) {
                    //current img is something else, show sync img directly
                    src = "sync16.png";
                    tbSync.setSyncData(account, "accountManagerLastUpdated", Date.now());
                } else if ((Date.now() - tbSync.getSyncData(account, "accountManagerLastUpdated")) > 400) {
                    //current img is one of the sync images, flip at lower speed see them rotate
                    if (current.indexOf("sync16.png") == -1) src = "sync16.png"; else src = "sync16_r.png";
                    tbSync.setSyncData(account, "accountManagerLastUpdated", Date.now());
                } else {
                    return current;
                }
                break;

            default:
                src = "error16.png";
        }

        return "chrome://tbsync/skin/" + src;
    },

    updateAccountStatus: function (id) {
        let listItem = document.getElementById("tbSyncAccounts.accounts." + id);
        this.setStatusImage(id, listItem.childNodes[1].firstChild);
    },

    updateAccountNameObserver: {
        observe: function (aSubject, aTopic, aData) {
            let pos = aData.indexOf(":");
            let id = aData.substring(0, pos);
            let name = aData.substring(pos+1);
            tbSyncAccounts.updateAccountName (id, name);
        }
    },

    updateAccountName: function (id, name) {
        let listItem = document.getElementById("tbSyncAccounts.accounts." + id);
        if (listItem.firstChild.getAttribute("label") != name) listItem.firstChild.setAttribute("label", name);
    },
    
    updateAccountsList: function (accountToSelect = -1) {
        let accountsList = document.getElementById("tbSyncAccounts.accounts");
        let accounts = tbSync.db.getAccounts();

        if (accounts.IDs.length > null) {

            //get current accounts in list and remove entries of accounts no longer there
            let listedAccounts = [];
            for (let i=accountsList.getRowCount()-1; i>=0; i--) {
                listedAccounts.push(accountsList.getItemAtIndex (i).value);
                if (accounts.IDs.indexOf(accountsList.getItemAtIndex(i).value) == -1) {
                    accountsList.removeItemAt(i);
                }
            }

            //accounts array is without order, extract keys (ids) and loop over keys
            for (let i = 0; i < accounts.IDs.length; i++) {

                if (listedAccounts.indexOf(accounts.IDs[i]) == -1) {
                    //add all missing accounts (always to the end of the list)
                    let newListItem = document.createElement("richlistitem");
                    newListItem.setAttribute("id", "tbSyncAccounts.accounts." + accounts.IDs[i]);
                    newListItem.setAttribute("value", accounts.IDs[i]);
                    newListItem.setAttribute("label", accounts.data[accounts.IDs[i]].accountname);
                    newListItem.setAttribute("ondblclick", "tbSyncAccounts.toggleEnableState();");
                    
                    //add account name
                    let itemLabelCell = document.createElement("listcell");
                    itemLabelCell.setAttribute("class", "label");
                    itemLabelCell.setAttribute("flex", "1");
                    itemLabelCell.setAttribute("label", accounts.data[accounts.IDs[i]].accountname);
                    newListItem.appendChild(itemLabelCell);

                    //add account status
                    let itemStatusCell = document.createElement("listcell");
                    itemStatusCell.setAttribute("class", "img");
                    itemStatusCell.setAttribute("width", "30");
                    itemStatusCell.setAttribute("height", "30");
                    let itemStatus = document.createElement("image");
                    itemStatus.setAttribute("src", this.getStatusImage(accounts.IDs[i]));
                    itemStatus.setAttribute("style", "margin:2px;");
                    itemStatusCell.appendChild(itemStatus);

                    newListItem.appendChild(itemStatusCell);
                    accountsList.appendChild(newListItem);
                } else {
                    //update existing entries in list
                    this.updateAccountName(accounts.IDs[i], accounts.data[accounts.IDs[i]].accountname);
                    this.updateAccountStatus(accounts.IDs[i]);
                }
            }
            
            //find selected item
            for (let i=0; i<accountsList.getRowCount(); i++) {
                if (accountToSelect == accountsList.getItemAtIndex(i).value || accountToSelect == -1) {
                    accountsList.selectedIndex = i;
                    accountsList.ensureIndexIsVisible(i);
                    break;
                }
            }

        } else {
            //No defined accounts, empty accounts list and load dummy
            for (let i=accountsList.getRowCount()-1; i>=0; i--) {
                accountsList.removeItemAt(i);
            }
            
            const LOAD_FLAGS_NONE = Components.interfaces.nsIWebNavigation.LOAD_FLAGS_NONE;
            document.getElementById("tbSyncAccounts.contentFrame").webNavigation.loadURI("chrome://tbsync/content/manager/noaccounts.xul", LOAD_FLAGS_NONE, null, null, null);
        }
    },


    //load the pref page for the currently selected account (triggered by onSelect)
    loadSelectedAccount: function () {
        let accountsList = document.getElementById("tbSyncAccounts.accounts");
        if (accountsList.selectedItem !== null && !isNaN(accountsList.selectedItem.value)) {
            //get id of selected account from value of selectedItem
            this.selectedAccount = accountsList.selectedItem.value;
            const LOAD_FLAGS_NONE = Components.interfaces.nsIWebNavigation.LOAD_FLAGS_NONE;
            document.getElementById("tbSyncAccounts.contentFrame").webNavigation.loadURI("chrome://tbsync/content/provider/"+tbSync.db.getAccountSetting(this.selectedAccount, "provider")+"/accountSettings.xul?id=" + this.selectedAccount, LOAD_FLAGS_NONE, null, null, null);
        }
    }
    
};

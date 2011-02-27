/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Firefox.
 *
 * The Initial Developer of the Original Code is
 * Gavin Sharp.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Gavin Sharp <gavin@gavinsharp.com> (Original author)
 *   Malte Kraus <mails@maltekraus.de>
 *   Johannes Stein <johannes@unsyn.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


var Lookpick = singleton = {
	current_lookpick: null,
	current_query: '',
	search_boxes: null,
	current_user_login: '',
	client_list_version: 0,
	HOST: "lookpicking.com",
	//HOST: "localhost:3001",
	lp_form:null, lp_node:null, lp_url:null, lp_title:null, lp_description:null, lp_method:null,
	default_lookpick: null,
	dialog_closing_state: null,
	periodical_dialog_checker:null,
	old_version:false,
	old_browser_field_width:'16em',
	first_load:true,
	ignore_netork_errors:false,
	displaying_network_error:false,
	current_textfield_value:'', /*needed for hack for ff3b5*/
	previous_default_text:'',
	logout_pending:false,
	current_color: 'white', /*color for buttons and textfield background*/
	is_alt_key_pressed: false,
	is_ctrl_key_pressed: false,
	preference_manager: null,
	default_avatar_url: '',
	just_made_a_request: false,
	textfield_value_tmp: '',
	extension_version: '0.4',
	login_message: 'You are not logged into lookpicking.com.\nYou have to be logged in to add new lookpicks.',

	network_error_timeouts:[],

	init: function init_lookpick()
	{
		//JSON setup stuff
		//ensure compatibility with other ff3.0-based add-ons with custom json implementations by providing a limited scope
		if(typeof(JSON) == "undefined")
		{//ff3.0
			Components.utils.import("resource://gre/modules/JSON.jsm", Lookpick);
		}
		else
		{//ff3.1
			Lookpick.JSON = {};
			Lookpick.JSON.fromString = JSON.parse;
			Lookpick.JSON.toString = JSON.stringify;
		}

		var lookpick_visible = Lookpick.get_pref_man().getBoolPref("extensions.lookpick.is_visible");
		if(!lookpick_visible) Lookpick.bring_up_original();

		Lookpick.set_version_dependent_stuff();
		setTimeout("Lookpick.refresh_lookup_list()",1000);
		//~ setTimeout("document.getElementById('searchbar-lp').value=Lookpick.get_default_textfield_value();",2000);
		var menu = document.getElementById("contentAreaContextMenu");
		menu.addEventListener("popupshowing", function() {Lookpick.onPopupShowing();}, false);
		var appcontent = document.getElementById("appcontent");   // browser
		if(appcontent)
		{
			appcontent.addEventListener("DOMContentLoaded", Lookpick.onBrowserPageLoad, true);//for detecting when one logs in and out of lookpicking.com and updating default search box text. and opensearch description detection.
		}
		// Listen for webpage loads
    	gBrowser.addProgressListener(myExt_urlBarListener, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);


		var deck = document.getElementById('searchbar');

		deck.focus = null;
		deck.select = Lookpick.deck_select_handler;

		var orig = document.getElementById('searchbar-orig');
		orig.rebuildPopupDynamic = Lookpick.build_orig_dynamic_popup;
		//Fix for better 'Tab Mix Plus' compatibility
		deck.handleSearchCommand = orig.handleSearchCommand;
		deck.doSearch = orig.doSearch;

		var field = document.getElementById('searchbar-lp');
		field.openPopup = Lookpick.open_autocomplete_popup;

		//works only in ff3.1 (or above?)
		field.inputField.setAttribute('ondrop', "nsDragAndDrop.drop(event, textfield_drop_observer);");

		if(Lookpick.is_on_mac())
		{
			var toplevel = document.getElementById('searchbar');
			toplevel.setAttribute("class", "mac");
			field.inputField.setAttribute("class", "autocomplete-textbox textbox-input inactive-inner");
		}
		if(Lookpick.is_on_linux())
		{
			var toplevel = document.getElementById('searchbar');
			toplevel.setAttribute("class", "linux");
		}
	},

	uninit: function uninit()
	{
		gBrowser.removeProgressListener(myExt_urlBarListener);
	},

	get_pref_man: function get_pref_man()
	{
		if(Lookpick.preference_manager == null)
			Lookpick.preference_manager = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
		return Lookpick.preference_manager;
	},

	build_orig_dynamic_popup: function build_orig_dynamic_popup()//taken from original searchbar code bindings and adapted
	{
          // We might not have added the main popup items yet, do that first
          // if needed.
          if (this._needToBuildPopup)
            this.rebuildPopup();

          var popup = this._popup;
          // Clear any addengine menuitems, including addengine-item entries and
          // the addengine-separator.  Work backward to avoid invalidating the
          // indexes as items are removed.
          var items = popup.childNodes;
          for (var i = items.length - 1; i >= 0; i--) {
            if (items[i].getAttribute("class").indexOf("addengine") != -1)
              popup.removeChild(items[i]);
          }

          var addengines = getBrowser().mCurrentBrowser.engines;
          const kXULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
          if (addengines && addengines.length > 0) {
            //const kXULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"; //<-- needs to be put out of block, needed outside (below)

            // Find the (first) separator in the remaining menu, or the first item
            // if no separators are present.
            var insertLocation = popup.firstChild;
            while (insertLocation.nextSibling &&
                   insertLocation.localName != "menuseparator") {
              insertLocation = insertLocation.nextSibling;
            }
            if (insertLocation.localName != "menuseparator")
              insertLocation = popup.firstChild;

            var separator = document.createElementNS(kXULNS, "menuseparator");
            separator.setAttribute("class", "addengine-separator");
            popup.insertBefore(separator, insertLocation);

            // Insert the "add this engine" items.
            for (var i = 0; i < addengines.length; i++) {
              var menuitem = document.createElement("menuitem");
              var engineInfo = addengines[i];
              var labelStr =
                  this._stringBundle.getFormattedString("cmd_addFoundEngine",
                                                        [engineInfo.title]);
              menuitem = document.createElementNS(kXULNS, "menuitem");
              menuitem.setAttribute("class", "menuitem-iconic addengine-item");
              menuitem.setAttribute("label", labelStr);
              menuitem.setAttribute("tooltiptext", engineInfo.uri);
              menuitem.setAttribute("uri", engineInfo.uri);
              if (engineInfo.icon)
                menuitem.setAttribute("src", engineInfo.icon);
              menuitem.setAttribute("title", engineInfo.title);
              popup.insertBefore(menuitem, insertLocation);
            }
          }

		//add lookpick menu item
		  if(document.getElementById('switch-to-lookpick') == null)
		  {
			  var menuitem = document.createElement("menuitem");
			  menuitem = document.createElementNS(kXULNS, "menuitem");
			  menuitem.setAttribute('label', 'lookpick');
			  menuitem.setAttribute('tooltiptext', 'Switch to lookpick');
			  menuitem.setAttribute('image', 'chrome://lookpick/skin/lp-icon.png');
			  menuitem.setAttribute("class", "menuitem-iconic");
			  menuitem.setAttribute("id", "switch-to-lookpick");
			  menuitem.addEventListener('command', Lookpick.bring_up_lookpick, true);
			  popup.insertBefore(menuitem, popup.firstChild);
		  }
	},

	open_autocomplete_popup: function open_autocomplete_popup()//taken from original searchbar code bindings and adapted
	{
          var popup = this.popup;
          if (!popup.mPopupOpen) {
            // Initially the panel used for the searchbar (PopupAutoComplete
            // in browser.xul) is hidden to avoid impacting startup / new
            // window performance. The base binding's openPopup would normally
            // call the overriden openAutocompletePopup in urlbarBindings.xml's
            // browser-autocomplete-result-popup binding to unhide the popup,
            // but since we're overriding openPopup we need to unhide the panel
            // ourselves.
            popup.hidden = false;

            popup.mInput = this;
            popup.view = this.controller.QueryInterface(Components.interfaces.nsITreeView);
            popup.invalidate();

            popup.showCommentColumn = this.showCommentColumn;
            popup.showImageColumn = this.showImageColumn;

            document.popupNode = null;

            //var outerRect = this.getBoundingClientRect();
            var outerRect = document.getElementById('search-go-container').getBoundingClientRect();
            //var innerRect = this.inputField.getBoundingClientRect();
            var innerRect = this.getBoundingClientRect();
            var width = outerRect.right - innerRect.left;
            popup.setAttribute("width", width > 100 ? width : 100);

            // setConsumeRollupEvent() before we call openPopup(),
            // see bug #404438 for more details
            popup.popupBoxObject.setConsumeRollupEvent(
              this.consumeRollupEvent ?
                Ci.nsIPopupBoxObject.ROLLUP_CONSUME :
                Ci.nsIPopupBoxObject.ROLLUP_NO_CONSUME);
            popup.openPopup(null, "", innerRect.left, outerRect.bottom, false, false);
          }
	},

	bring_up_lookpick: function bring_up_lookpick()
	{
		document.getElementById('searchbar').selectedIndex = 0;
		Lookpick.ignore_network_errors = false;
		var field = document.getElementById('searchbar-lp');
		field.value = Lookpick.get_default_textfield_value();
		Lookpick.handle_textfield_blur(document.getElementById("searchbar-lp"));
		Lookpick.refresh_lookup_list();
		Lookpick.get_pref_man().setBoolPref("extensions.lookpick.is_visible", true);
	},

	bring_up_original: function bring_up_original()
	{
		document.getElementById('searchbar').selectedIndex = 1;
		Lookpick.revert_textfield();
		var orig = document.getElementById('searchbar-orig');
		orig.rebuildPopupDynamic();
		Lookpick.get_pref_man().setBoolPref("extensions.lookpick.is_visible", false);
	},

	deck_select_handler: function deck_select_handler()
	{
		if(this.selectedIndex==0)//lookpick visible
		{
			document.getElementById('searchbar-lp').select();
		}
		else if(this.selectedIndex==1)//original search field visible
		{
			document.getElementById('searchbar-orig').select();
		}
	},

	set_version_dependent_stuff: function set_version_dependent_stuff()
	{//check for ff1.5, and set a variable so we can apply fixes accordingly if needed later on.
		var version = navigator.userAgent.match("rv:([\\d.]+)")[1];
		switch(version.substring(0, 5))
		{
			case '1.8.1':
				//~ alert('ff 2.0');
			break;
			case '1.8.0':
				//~ alert('ff 1.5');
				Lookpick.old_version = true;
				Lookpick.apply_old_browser_fixes();
			break;
			default:
			break;
		}
	},

	is_on_mac: function is_on_mac()
	{
		return navigator.userAgent.indexOf('Mac') != -1;
	},

	is_on_linux: function is_on_linux()
	{
		return navigator.userAgent.toLowerCase().indexOf('linux') != -1;
	},

	onPopupShowing: function onPopupShowing()
	{
		gContextMenu.showItem("context-searchfield", gContextMenu.onTextInput);
	},

	get_search_params: function get_search_params(type, list, url, query_var)
	{
		var str = '[[';
		str += '"'+type+'"'
		str += '],[';
		var is_list_empty = true;
		for(var i=0; i<list.length; i++)
		{
			var title = list[i];
			str += '"'+title+'",'
			is_list_empty = false;
		}
		if(! is_list_empty) str = str.substring(0, str.length-1);
		str += "]";
		if(type=="remote")
		{
			str += ',["'+url+'"],["'+query_var+'"]';
		}
		str += "]";
		return str;
	},

	handle_textfield_submit: function handle_textfield_submit(field, is_drag_and_drop)
	{
		if(Lookpick.ignore_network_errors) return;

		if(Lookpick.is_ctrl_key_pressed)
		{//do an in-page search
			var findbar = document.getElementById("FindToolbar");
			findbar.query_text = document.getElementById("searchbar-lp").value;
			findbar.onFindCommand();
			return;
		}

		if(Lookpick.get_current_lookpick() == null)
		{
			if(field.searchParam.indexOf(field.value)!=-1 && !is_drag_and_drop)
			{
				//get the engine

				//hackish
				var a = field.value;
				var b = Lookpick.current_textfield_value;
				var ai = field.searchParam.indexOf(a);
				var bi = field.searchParam.indexOf(b);
				//dump("a: "+a+", b: "+b+", ai: "+ai+", bi: "+bi+"\n");
				if(ai<bi && a.toLowerCase().indexOf(b.toLowerCase())==-1) field.value = Lookpick.current_textfield_value;
				Lookpick.retrieve_lookpick(field.value);
			}
			else//do a default search
			{
				Lookpick.set_current_query(field.value);
				Lookpick.do_actual_search(Lookpick.get_default_lookpick(), field.value, Lookpick.is_alt_key_pressed);
			}
		}
		else
		{
			if(Lookpick.get_current_lookpick().autocomplete_url != '')
			{//handle selection of autocomplete for lookpick if present
				//hackish
				var a = field.value;
				var b = Lookpick.current_textfield_value;
				var ai = field.searchParam.indexOf(a);
				var bi = field.searchParam.indexOf(b);
				//dump("a: "+a+", b: "+b+", ai: "+ai+", bi: "+bi+"\n");
				if(ai<bi && a.toLowerCase().indexOf(b.toLowerCase())==-1) field.value = Lookpick.current_textfield_value;
			}
			Lookpick.set_current_query(field.value);
			Lookpick.do_actual_search(Lookpick.get_current_lookpick(), field.value, Lookpick.is_alt_key_pressed);
		}
	},

	handle_submit_button_click: function handle_submit_button_click(e, field)//always search, never try to fetch a lookpick
	{
		var alt = e.altKey;
		var query = field.value;
		if(query == Lookpick.get_default_textfield_value())
		{
			query = Lookpick.get_current_query();
		}

		if(Lookpick.get_current_lookpick() == null)
		{ //default search
				Lookpick.set_current_query(query);
				Lookpick.do_actual_search(Lookpick.get_default_lookpick(), query, alt);
		}
		else
		{ //search using specific lookpick
			Lookpick.set_current_query(query);
			Lookpick.do_actual_search(Lookpick.get_current_lookpick(), query, alt);
		}
	},

	retrieve_lookpick: function retrieve_lookpick(title)
	{//once a lookpick has been selected, its properties have to be retrieved from the server.
		Lookpick.WebMethod("http://"+Lookpick.HOST+"/frontend/moz_lookpick_by_title","title="+encodeURIComponent(title),Lookpick.setup_lookpick_handler, true, null, true);
	},

	setup_lookpick_handler: function setup_lookpick_handler(pick)
	{//lookpick is a js object created on the server. it has all the form properties.
		if(pick=='error')
		{
			Lookpick.revert_textfield();
			Lookpick.set_pending_to(false);
			return;
		}
		try{
			var lookpick = Lookpick.JSON.fromString(pick);
		}catch(e){}
		Lookpick.set_current_lookpick(lookpick);
		setTimeout("Lookpick.setup_lookpick_handler2()", 10);
	},

	setup_lookpick_handler2: function setup_lookpick_handler()
	{
		var field=document.getElementById('searchbar-lp');
		field.value=Lookpick.get_current_query();
		field.select();
	},

	handle_button_onclick: function handle_button_onclick()
	{
		var btn = document.getElementById('lookpick-button');
		if(btn.className == 'button_help')
		{
			//show context menu
			document.getElementById('lookpick-menu').showPopup (btn, -1, -1, 'popup', 'topright', 'topleft');

		}else if(Lookpick.get_current_lookpick()==null && btn.className != 'button_pending' && btn.className != 'button_pending_green')
		{
			Lookpick.clear_textfield();
		}else
		{
			Lookpick.revert_textfield();
		}
	},

	clear_textfield: function clear_textfield()
	{
		var field = document.getElementById('searchbar-lp');
		field.value = '';
		Lookpick.handle_textfield_input(field);
	},

	revert_textfield: function revert_textfield(no_focus)
	{
		var field = document.getElementById('searchbar-lp');
		Lookpick.set_current_lookpick(null);
		setTimeout("var f=document.getElementById('searchbar-lp');f.value='';Lookpick.handle_textfield_input(f)", 10);
		field.focus();
		//kind of hackish. prevents 'zombie focus'
		//removed due to ff 3.6 incompatibility
//		if(!no_focus)
//		{
//			setTimeout("document.getElementById('searchbar-lp').focus()", 200);
//			setTimeout("document.getElementById('searchbar-lp').blur()", 300);
//		}
	},

	show_help: function show_help()
	{
		window.getBrowser().selectedTab = window.getBrowser().addTab();
		var url = 'http://'+Lookpick.HOST+'/help/extension_popup';
		loadURI(url, null, null, false);
	},

	edit_lookpick: function edit_lookpick(id)
	{
		window.content.open('http://'+Lookpick.HOST+'/boxes/view_single_lookpick/'+id, 'edit_lookpick', 'width=550,height=160,scrollbars=1');
	},

	show_login_dialog_or_homepage: function show_login_dialog_or_homepage()
	{
		if(Lookpick.current_user_login == "")
		{
			window.openDialog("chrome://lookpick/content/login_dialog.xul", "login", "chrome,dependent,alwaysRaised", Lookpick.do_login, Lookpick.go_to_signup_page);
		}
		else
		{
			window.getBrowser().selectedTab = window.getBrowser().addTab();
			var url = 'http://'+Lookpick.HOST+'/';
			loadURI(url, null, null, false);
		}
	},

	do_login: function do_login(username, password, remember)
	{
		Lookpick.WebMethod("http://"+Lookpick.HOST+"/session/moz_login","login="+username+"&password="+password+"&remember_me="+remember,Lookpick.login_callback, false, null, true);
	},

	login_callback: function login_callback(response)
	{
		if(response == "ok")
		{
			Lookpick.refresh_lookup_list(false, true);//not after_logout, but do force a refresh
		}
		else
		{
			Lookpick.show_login_dialog_or_homepage();
		}
	},

	go_to_signup_page: function go_to_signup_page()
	{
		window.content.location = 'http://'+Lookpick.HOST+'/signup';
	},

	go_to_latest_lookpicks: function go_to_latest_lookpicks()
	{
		window.getBrowser().selectedTab = window.getBrowser().addTab();
		var url = 'http://'+Lookpick.HOST+'/mine/date';
		loadURI(url, null, null, false);
	},

	check_for_lookpick_updates: function check_for_lookpick_updates()
	{
		window.getBrowser().selectedTab = window.getBrowser().addTab();
		var url = 'http://'+Lookpick.HOST+'/help/extension_update?version='+Lookpick.extension_version;
		loadURI(url, null, null, false);
	},

	do_actual_search: function do_actual_search(pick, query, alt_key)
	{
		if(pick != null)
		{
			var url = Lookpick.generate_url_from_lookpick(pick, query);
			var postdata = Lookpick.generate_postdata_from_lookpick(pick, query);
			var new_tab_default = Lookpick.get_pref_man().getBoolPref("browser.search.openintab");
			if(alt_key != new_tab_default)
				window.getBrowser().selectedTab = window.getBrowser().addTab();
			loadURI(url, null, postdata, false);
			content.focus();
			Lookpick.handle_textfield_blur(document.getElementById("searchbar-lp"));
		}
	},

	generate_url_from_lookpick: function generate_url_from_lookpick(pick, query)
	{
		var url = "";
		url = pick.uri;
		var fields_string = "";
		if(pick.field_name != null && pick.field_name != "") //build url the classic way...
		{
			if(pick.is_post)
			{
				//url = pick.url;
			}
			else
			{
				//check if there are already any get vars in uri, and choose first char accordingly.
				fields_string = url.indexOf('?') == -1 ? '?' : '&';
				fields_string += pick.field_name + '=' + query;
			}
		}else //...or the opensearch-template way (obviously ignoring POST type for the dynamic fields)
		{
			if(url.indexOf("{%2}")==-1) //just one parameter
			{
				url = url.replace("{searchTerms}", query);
			}
			else //more than one field
			{
				//allow any of |, >, / as separators
				var separator = "|";
				var query_arr = [];
				query_arr = query.split(separator);
				if(query_arr.length < 2)
				{
					separator = ">";
					query_arr = query.split(separator);
				}
				if(query_arr.length < 2)
				{
					separator = "/";
					query_arr = query.split(separator);
				}
				url = url.replace("{searchTerms}", Lookpick.trim_string(query_arr.shift()));
				var next_placeholder = "{%2}";
				var i = 2;
				while(next_placeholder != "" && i <= 10)
				{
					var possible_next = "{%"+(i+1)+"}";
					if(url.indexOf(possible_next) == -1)
					{
						url = url.replace(next_placeholder, Lookpick.trim_string(query_arr.join(separator)));
						next_placeholder = "";
					}else
					{
						var query_part = Lookpick.trim_string((query_arr.shift()||"")) || "";
						url = url.replace(next_placeholder, query_part);
						next_placeholder = possible_next;
					}
					i++;
				}
			}
		}
		if(!pick.is_post) //append get vars if applicable
		{
			for(var i=0; i<pick.hidden_fields.length; i++)
			{
				var conn = '&'
				if(i==0 && fields_string.indexOf('?') == -1 && url.indexOf('?') == -1) conn = '?';
				fields_string += conn + pick.hidden_fields[i].name + '=' + pick.hidden_fields[i].value;
			}
			url += fields_string;
		}
		return url;
	},

	generate_postdata_from_lookpick: function generate_postdata_from_lookpick(pick, query)
	{
		var fields_string = null;
		if(pick.is_post)
		{
			fields_string = '';
			if(pick.field_name!="") fields_string += pick.field_name + '=' + query;
			for(var i=0; i<pick.hidden_fields.length; i++)
			{
				if(fields_string!='') fields_string += '&';
				fields_string += pick.hidden_fields[i].name + '=' + pick.hidden_fields[i].value;
			}
			fields_string = getPostDataStream(fields_string, null, null, "application/x-www-form-urlencoded");
		}
		return fields_string;
	},

	get_current_lookpick: function get_current_lookpick()
	{
		return Lookpick.current_lookpick;
	},

	get_current_query: function get_current_query()
	{
		return Lookpick.current_query;
	},

	set_color: function set_color(clr)
	{
		Lookpick.current_color = clr;
		Lookpick.set_textfield_color(clr);
		Lookpick.set_button_color(clr);
	},

	get_color: function get_color()
	{
		return Lookpick.current_color;
	},

	set_textfield_color: function set_textfield_color(clr)
	{
		var field = document.getElementById('searchbar-lp');
		var outer_class = "";
		var inner_class = "";
		if(clr == "red")
		{
			outer_class = "step1";
			inner_class = "step1-inner";
		}
		else if(clr == "green")
		{
			outer_class = "step2";
			inner_class = "step2-inner";
		}
		else if(clr == "white")
		{
			outer_class = "inactive";
			inner_class = "inactive-inner";
		}
		else if(clr == "yellow")
		{
			outer_class = "blinking";
			inner_class = "blinking-inner";
		}
		else
		{
			dump("don't know how to handle color in set_textfield_color. color is: "+clr+"\n");
		}
		field.setAttribute("class", "searchbar-lp-textbox "+outer_class);
		field.inputField.setAttribute("class", "autocomplete-textbox textbox-input "+inner_class);
	},

	set_button_color: function set_button_color(clr)
	{
		var button = document.getElementById('lookpick-button');
		var submit_button = document.getElementById('search-go-button');
		if(!Lookpick.is_on_mac())
		{
			var color = "";
			if(clr == "red") color = "#FFECDF";
			else if(clr == "green") color = "#EBF3E4";
			else if(clr == "white") color = "#FFFFFF";
			else if(clr == "yellow") color ="#FFFF99";
			else dump("unknown color in set_button_color: "+clr+"\n");
			button.style.backgroundColor = color;
			submit_button.style.backgroundColor = color;
		}
		else //on mac os
		{
			var selector = document.getElementById('lookpick-selector-button');
			var button_border = document.getElementById('lookpick-button-border');
			var submit_container = document.getElementById('search-go-container');
			if(clr == "red")
			{
				selector.setAttribute('class', 'selector-button selector-red');
				submit_container.setAttribute('class', 'search-go-container search-red');
				button_border.setAttribute('class', 'button-border button-border-red');
			}
			else if(clr == "green")
			{
				selector.setAttribute('class', 'selector-button selector-green');
				submit_container.setAttribute('class', 'search-go-container search-green');
				button_border.setAttribute('class', 'button-border button-border-green');
			}
			else if(clr == "white")
			{
				selector.setAttribute('class', 'selector-button selector-white');
				submit_container.setAttribute('class', 'search-go-container search-white');
				button_border.setAttribute('class', 'button-border button-border-white');
			}
			else if(clr == "yellow")
			{
				selector.setAttribute('class', 'selector-button selector-yellow');
				submit_container.setAttribute('class', 'search-go-container search-yellow');
				button_border.setAttribute('class', 'button-border button-border-yellow');
			}
			else dump("unknown color in set_button_color: "+clr+"\n");
		}
	},

	set_current_lookpick: function set_current_lookpick(pick)
	{
		Lookpick.current_lookpick = pick;

		var field = document.getElementById('searchbar-lp');
		var button = document.getElementById('lookpick-button');
		var icon = document.getElementById('lookpick-engine-image');

		//var border = document.getElementById('lookpick-button-border');
		if(pick == null)
		{
			Lookpick.set_color("red");
			field.removeEventListener("input", Lookpick.update_suggest_list, false);
			field.setAttribute('inputtooltiptext', 'choose a lookpick');
			field.setAttribute('disableautocomplete', 'false');
			field.setAttribute('completedefaultindex', true);
			field.setAttribute('forcecomplete', 'true');
			if(Lookpick.search_boxes != null)
				field.setAttribute("autocompletesearchparam", Lookpick.get_search_params("local", Lookpick.search_boxes));
			button.setAttribute('class', 'button_help');
			button.setAttribute('tooltiptext', 'help');
			Lookpick.apply_old_browser_fixes();
			var icon_url = Lookpick.default_avatar_url == '' ? 'chrome://lookpick/skin/lp-icon.png;' : Lookpick.default_avatar_url;
			icon.setAttribute('src', icon_url);

			//remove the menu item for editing the current lookpick, if present
			var menu = document.getElementById('searchbar-popup');
			var item = document.getElementById('edit-current-lookpick');
			try{
			menu.removeChild(item);
			}catch(x){}
			menu.firstChild.setAttribute('style','font-weight:bold;');
		}
		else //a lookpick has been chosen
		{
			Lookpick.set_color("green");
			field.setAttribute('inputtooltiptext', pick.title+"\n"+pick.description);
			field.setAttribute('completedefaultindex', true);
			field.setAttribute('forcecomplete', false);
			button.setAttribute('class', 'button_back');
			button.setAttribute('tooltiptext', 'back to lookpick selection [esc]');
			Lookpick.apply_old_browser_fixes();
			if(pick.autocomplete_url != '')//might be either be classic or opensearch style definition, depending on nonemptyness of pick.autocomplete_variable_name
			{
				field.setAttribute('completedefaultindex', false);
				field.addEventListener("input", Lookpick.update_suggest_list, false);
				Lookpick.update_suggest_list();
			}
			else//no autocomplete available
			{
				field.setAttribute('disableautocomplete', 'true');
			}

			var icon_uri_string = "";
			if(pick.icon_url != "default" && pick.icon_url != null)
			{
				icon_uri_string = pick.icon_url;
			}
			else
			{
				var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
				var faviconService = Components.classes["@mozilla.org/browser/favicon-service;1"].getService(Components.interfaces.nsIFaviconService);
				try {
					var uri = ios.newURI(pick.uri, null, null);
					var icon_uri = faviconService.getFaviconForPage(uri);
					icon_uri_string = icon_uri.spec;
				} catch (ex) {
					//favicon is not cached for the result url. get it manually.
					icon_uri_string = "http://"+Lookpick.get_domain_from_uri(pick.uri)+"/favicon.ico";
				}
			}
			icon.setAttribute('src', icon_uri_string);

			if(Lookpick.current_user_login != '' && Lookpick.current_user_login != null)
			{
				//setup a menu item to edit the current lookpick
				var menu = document.getElementById('searchbar-popup');
				const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
				var item = document.createElementNS(XUL_NS, 'menuitem');
				item.setAttribute('label', "Details for '"+pick.title+"'");
				item.setAttribute('class', 'menuitem-iconic');
				item.setAttribute('image', icon_uri_string);
				item.setAttribute('oncommand', "Lookpick.edit_lookpick("+parseInt(pick.id).toString()+");"); //just making sure it's nothing but an integer
				item.setAttribute('id', 'edit-current-lookpick');
				item.setAttribute('style', 'font-weight:bold;');
				menu.firstChild.setAttribute('style', 'font-weight:normal;');
				menu.insertBefore(item, menu.firstChild);
			}
		}
	},

	update_suggest_list: function update_suggest_list()
	{
		var url = Lookpick.get_current_lookpick().autocomplete_url;
		var query_var_name = Lookpick.get_current_lookpick().autocomplete_variable_name;
		var field = document.getElementById('searchbar-lp');
		field.setAttribute("autocompletesearchparam", "[]");
		field.setAttribute("autocompletesearchparam", Lookpick.get_search_params("remote", "", url, query_var_name));
	},

	get_domain_from_uri: function get_domain_from_uri(uri)
	{
		if (uri == null || uri.length == 0)
			return "";

   		uri = uri.toLowerCase();
   		if(uri.indexOf('http://')==0)
   			uri = uri.substring(7);

   		if(uri.indexOf('https://')==0)
   			uri = uri.substring(8);

   		var i = uri.indexOf("/");
   		if (i > -1)
      		uri = uri.substring(0, i);

   		var parts = uri.split('.');
   		var len = parts.length;
   		if (len < 3)
      		return uri;

   		var lastPart = parts[len-1];
   		var secondPart;
   		secondPart = parts[len-2];
   		var two = 2;
   		if (lastPart == "uk" && secondPart == "co")//TODO add more two-part 'TLDs'
      		++two;

   		if (len >= 0)
      		return parts.splice(len-two, two).join('.');

   		return "";
	},

	set_current_query: function set_current_query(q)
	{
		Lookpick.current_query = q;
	},

	get_default_lookpick: function get_default_lookpick()
	{
		return Lookpick.default_lookpick;
	},

	set_default_lookpick: function set_default_lookpick(pick)
	{
		Lookpick.default_lookpick = pick;
	},

	get_default_textfield_value: function get_default_textfield_value(hovering)
	{
		var val = "choose a lookpick";
		if(Lookpick.ignore_network_errors)
		{
			val = "(offline)"
		}
		else if(Lookpick.get_current_lookpick() != null)
		{
			var pick = Lookpick.get_current_lookpick();
			var ellipsis_or_nothing = pick.instructions ? "..." : "";
			if(hovering && pick.instructions)
			{
				val = pick.instructions;
			}
			else if(Lookpick.get_current_query() != '')
			{
				val = Lookpick.get_current_query()+" ("+pick.title+")"+ellipsis_or_nothing;
			}
			else
			{
				val = pick.title+ellipsis_or_nothing;
			}
		}
		else if(Lookpick.current_user_login != "")
		{
			var suffix = Lookpick.current_user_login.substring(Lookpick.current_user_login.length-1) == "s" ? "'" : "'s";
			var default_lookpick_title = (Lookpick.default_lookpick == null || Lookpick.default_lookpick == '') ? "" : " (" +Lookpick.default_lookpick.title+")";
			val = Lookpick.current_user_login + suffix + " lookpicks" + default_lookpick_title;
		}
		return val;
	},

	handle_textfield_mouseover: function handle_textfield_mouseover(field)
	{
		if(field.value == Lookpick.get_default_textfield_value())
		{
			field.value = Lookpick.get_default_textfield_value(true);
		}
	},

	handle_textfield_mouseout: function handle_textfield_mouseout(field)
	{
		if(field.value == Lookpick.get_default_textfield_value(true))
		{
			field.value = Lookpick.get_default_textfield_value();
		}
	},

	handle_textfield_click: function handle_textfield_click(field)
	{
		if(field.value==Lookpick.get_default_textfield_value() || field.value==Lookpick.get_default_textfield_value(true)) field.select();Lookpick.handle_textfield_input(field);
	},

	handle_textfield_focus: function handle_textfield_focus(field)
	{
		Lookpick.refresh_lookup_list();

		//show query only and possibly select it
		if(Lookpick.get_current_lookpick()!=null)
		{
			Lookpick.set_color("green");
			if((Lookpick.get_current_query()!='' && field.value!=Lookpick.get_current_query() && field.value.indexOf(Lookpick.get_current_lookpick().title)!=-1) || field.value==Lookpick.get_default_textfield_value(true))
			{
				field.value = Lookpick.get_current_query();
				field.select();
			}
			else
			{
				field.select();
			}
		}
		else
		{
			Lookpick.set_color("red");
			field.select();
		}
	},

	handle_textfield_blur: function handle_textfield_blur(field)
	{
		field.value = '';
		//set default text only if box is not focused again immediately afterwards
		setTimeout("var field = document.getElementById('searchbar-lp');if(!field.focused) document.getElementById('searchbar-lp').value=Lookpick.get_default_textfield_value()", 50);
		Lookpick.handle_textfield_input(field);
		Lookpick.set_color("white");

		var btn = document.getElementById('lookpick-button');
		if(btn.className == 'button_pending' || btn.className == 'button_pending_green')
		{
			Lookpick.refresh_lookup_list();
		}
	},

	WebMethod: function WebMethod(url,request,callback, set_to_pending, json, override_time_limit)
	{//cf. http://georgenava.googlepages.com/xmlhttprequest.html
		if(document.getElementById('searchbar').selectedIndex == 0 && (!Lookpick.just_made_a_request || override_time_limit))//make calls only if lookpick is visible. and not too often
		{
			if(set_to_pending)
				Lookpick.set_pending_to(true);
			var http = new XMLHttpRequest();
			var mode = request?"POST":"GET";
			http.open(mode,url,true);
			if(mode=="POST"){http.setRequestHeader('Content-Type','application/x-www-form-urlencoded');}
			if(json) http.setRequestHeader('Content-Type','application/x-suggestions+json');
			Lookpick.network_error_timeouts.push(setTimeout("Lookpick.display_network_error();", 7000));
			http.onreadystatechange=function(){if(http.readyState==4 && http.responseText.length>0){Lookpick.ajax_handler(callback, http)}};
			//~ http.onerror=function(){alert('error');}
			http.send(request);
			if(!override_time_limit)
			{
				Lookpick.just_made_a_request = true;
				setTimeout("Lookpick.just_made_a_request=false;", 3000);
			}
		}
	},

	ajax_handler: function ajax_handler(callback, http)
	{
		for(var i = 0; i < Lookpick.network_error_timeouts.length; i++)
		{
			clearTimeout(Lookpick.network_error_timeouts[i]);
		}
		Lookpick.network_error_timeouts = [];
		var field = document.getElementById('searchbar-lp');
		if(Lookpick.ignore_network_errors && !field.focused)
		{
			field.value=Lookpick.get_default_textfield_value();
		}
		Lookpick.ignore_network_errors=false;
		callback(http.responseText);
	},

	display_network_error: function display_network_error()
	{
		var deck = document.getElementById('searchbar');
		var field = document.getElementById('searchbar-lp');
		if(!Lookpick.ignore_network_errors && !Lookpick.displaying_network_error && deck.selectedIndex == 0 && !field.focused)
		{
			Lookpick.displaying_network_error = true;
			Lookpick.ignore_network_errors = true;
			field.value=Lookpick.get_default_textfield_value();
			Lookpick.set_pending_to(false);
			content.focus();
			Lookpick.displaying_network_error = false;
		}
	},

	//check if update is needed and do so if so.
	refresh_lookup_list: function refresh_lookup_list(after_logout, force_refresh)
	{
		if(Lookpick.search_boxes==null)
		{
			Lookpick.client_list_version=0;
		}
		Lookpick.logout_pending = after_logout;
		Lookpick.WebMethod("http://"+Lookpick.HOST+"/frontend/moz_lookup","client_version="+Lookpick.client_list_version+"&current_user_login="+Lookpick.current_user_login+"&extension_version="+Lookpick.extension_version+"&format=json",Lookpick.refresh_lookup_list_callback, false, null, (after_logout || force_refresh));
		Lookpick.previous_default_text = Lookpick.get_default_textfield_value();
	},

	refresh_lookup_list_callback: function refresh_lookup_list_callback(response)
	{
		var field = document.getElementById('searchbar-lp');
		var icon = document.getElementById('lookpick-engine-image');
		if(Lookpick.trim_string(response)!="ok")
		{
			var response_obj = Lookpick.JSON.fromString(response);
			Lookpick.client_list_version = response_obj[0];
			Lookpick.search_boxes = response_obj[1];
			Lookpick.current_user_login = response_obj[2] == null ? '' : response_obj[2];
			if(response_obj[4]!=null)
				Lookpick.default_avatar_url = response_obj[4];
			else
				Lookpick.default_avatar_url = '';
			Lookpick.set_login_state_for_menu(Lookpick.current_user_login == '');
			//if(Lookpick.current_user_login=='') Lookpick.current_query = '';//TODO move down into appropriate block
			var default_pick = (response_obj[3] == "none") ? null : response_obj[3];
			Lookpick.set_default_lookpick(default_pick);
			field.setAttribute("autocompletesearchparam", Lookpick.get_search_params("local", Lookpick.search_boxes));
			if(Lookpick.default_avatar_url != '' && Lookpick.get_current_lookpick() == null)
			{
				icon.setAttribute("src", Lookpick.default_avatar_url);
			}
			if(!field.focused)
			{
				field.value=Lookpick.get_default_textfield_value();
			}
			if(Lookpick.logout_pending && Lookpick.current_user_login=='')
			{
				Lookpick.current_query = '';
				Lookpick.revert_textfield(true);
				Lookpick.default_avatar_url = '';
				icon.setAttribute("src", 'chrome://lookpick/skin/lp-icon.png');
				field.value = Lookpick.get_default_textfield_value();
				setTimeout("content.focus()", 60);
				setTimeout("content.focus()", 500);
				Lookpick.logout_pending = false;
			}
			Lookpick.detect_opensearch_plugins();
		}
		//update state, unless user is typing sth
		if(field.value == Lookpick.previous_default_text)
		{
			field.value=Lookpick.get_default_textfield_value();
		}
	},

	set_login_state_for_menu: function set_login_state_for_menu(is_not_logged_in)
	{
		//change lookpick menu contain a link to lookpicking.com or to login instead, depending on passed-in login state
		var item = document.getElementById('login-or-home');
		var newest = document.getElementById('my-newest-picks');
		if(is_not_logged_in)
		{
			item.setAttribute('label', 'log in');
			newest.setAttribute('hidden', 'true');
		}
		else
		{
			item.setAttribute('label', 'lookpicking.com');
			newest.setAttribute('hidden', 'false');
		}
	},

	trim_string: function trim_string(stringToTrim) {
		return stringToTrim.replace(/^\s+|\s+$/g,"");
	},

	handle_textfield_input_wrapper: function handle_textfield_input_wrapper(alt_key, ctrl_key, field)
	{
		Lookpick.is_alt_key_pressed = alt_key;
		Lookpick.is_ctrl_key_pressed = ctrl_key;
		Lookpick.handle_textfield_input(field);
	},

	handle_textfield_input: function handle_textfield_input(field)
	{
		Lookpick.current_textfield_value = field.value; //needed for hack for ff3b5
		var btn = document.getElementById('lookpick-button');
		if(Lookpick.current_lookpick==null && btn.className != 'button_pending' && btn.className != 'button_pending_green')
		{
			if(field.value!="" && field.value != Lookpick.get_default_textfield_value())
			{
				btn.setAttribute('class', 'button_clear');
				btn.setAttribute('tooltiptext', 'clear textfield');
				//~ btn.removeAttribute('popup');
			}
			else if(btn.className=='button_clear')
			{
				btn.setAttribute('class', 'button_help');
				btn.setAttribute('tooltiptext', 'help');
				//~ btn.setAttribute('popup');
			}
		}

		if(Lookpick.current_lookpick!=null && field.value!="" && field.value != Lookpick.get_default_textfield_value() && field.value != Lookpick.get_current_lookpick().title && field.value.length > 2)
		{
			Lookpick.set_current_query(field.value);
		}
	},

	handle_textfield_keydown: function handle_textfield_keydown(alt, ctrl)
	{
		Lookpick.is_alt_key_pressed = alt;
		Lookpick.is_ctrl_key_pressed = ctrl;
	},

	set_pending_to: function set_pending_to(pending)
	{
		var btn = document.getElementById('lookpick-button');
		var field = document.getElementById('searchbar-lp');
		switch(pending)
		{
			case true:
				if(Lookpick.current_lookpick==null)
				{
					btn.setAttribute('class', 'button_pending');
				}else
				{
					btn.setAttribute('class', 'button_pending_green');
				}
			break;
			case false:
				if(Lookpick.current_lookpick==null)
				{
					if(field.value=='' || field.value==Lookpick.get_default_textfield_value() || Lookpick.ignore_network_errors)
					{
						btn.setAttribute('class', 'button_help');
					}else
					{
						btn.setAttribute('class', 'button_clear');
					}
				}else
				{
					btn.setAttribute('class', 'button_back');
				}
			break;
		}
	},

	create_lookpick_callback: function create_lookpick_callback(resp)
	{
		Lookpick.set_pending_to(false);
		switch(resp)
		{
			case 'ok':
				//added it all right
				Lookpick.create_lookpick_feedback();
			break;
			case 'login':
				alert(Lookpick.login_message);
			break;
			case 'error':
				alert('We just heard a strange noise coming from the server!\nPlease check that your lookpick is there and working.\nSorry.\nYou might want to request this URL at lookpicking.com.');
			break;
		}
	},

	create_lookpick_feedback: function create_lookpick_feedback()
	{
		var back_to = Lookpick.get_color();
		Lookpick.set_color("yellow");
		Lookpick.apply_old_browser_fixes();
		setTimeout("Lookpick.set_color('"+back_to+"');Lookpick.apply_old_browser_fixes();", 600);
		Lookpick.refresh_lookup_list();
	},

	apply_old_browser_fixes: function apply_old_browser_fixes()
	{
		var field = document.getElementById('searchbar-lp');

		var button = document.getElementById('lookpick-button');
		if(Lookpick.old_version)
		{
			field.style.width = Lookpick.old_browser_field_width;
			field.style.minWidth = Lookpick.old_browser_field_width;

			button.style.height = '22px';

			button.style.minHeight = '22px';
		}
	},

	addEngineToSearchBar: function addEngineToSearchBar() {
		if(Lookpick.current_user_login == "")
		{
			alert(Lookpick.login_message);
		}else{
			Lookpick.lp_node = document.popupNode;
			Lookpick.lp_form = Lookpick.lp_node.form;
			var doc = Lookpick.lp_node.ownerDocument;
			var docURI = makeURI(doc.URL, doc.characterSet);
			var formURI = makeURI(Lookpick.lp_form.getAttribute("action"), doc.characterSet,docURI);
			Lookpick.lp_url = formURI.spec;
			Lookpick.lp_method = Lookpick.lp_form.method || "GET";
			Lookpick.lp_title = Lookpick.lp_node.ownerDocument.title;

			var metas = Lookpick.lp_node.ownerDocument.getElementsByTagName("meta");
			var description = "Automatically created lookpick.";
			for(var i=0; i<metas.length; i++)
			{
				if(metas[i].name=="description")
				{
					description = metas[i].content;
				}
			}
			Lookpick.lp_description = description;
			Lookpick.start_dialog_surveillance();
			var dialog = window.openDialog("chrome://lookpick/content/engineInfos.xul",
	                   "_blank",
	                   "chrome,resizable,dependent,dialog,minimizable,alwaysRaised");
			dialog.addEventListener("load", function onLoad(e) {e.currentTarget.document.getElementById("name").value = Lookpick.lp_title;e.currentTarget.document.getElementById("description").value = Lookpick.lp_description;}, false);
			dialog.addEventListener('dialogaccept', Lookpick.closed_dialog_callback, true);
			dialog.addEventListener('dialogcancel', Lookpick.closed_dialog_callback, true);//usecapture needs to be true for ff1.5 to work
		}
	},

	closed_dialog_callback: function closed_dialog_callback(evt)
	{
		if(evt.type=='dialogaccept')
		{
			var t = evt.currentTarget.document.getElementById('name').value;
			var d = evt.currentTarget.document.getElementById('description').value;
			if(t!="") Lookpick.lp_title = t;
			if(d!="") Lookpick.lp_description = d;
			Lookpick.dialog_closing_state = 'accept';
		}else
		{
			Lookpick.dialog_closing_state = 'cancel';
		}
	},

	start_dialog_surveillance: function start_dialog_surveillance()
	{
		Lookpick.periodical_dialog_checker = setInterval(Lookpick.detect_dialog_closing, 500);
	},

	stop_dialog_surveillance: function stop_dialog_surveillance()
	{
		clearInterval(Lookpick.periodical_dialog_checker);
	},

	detect_dialog_closing: function detect_dialog_closing()
	{
		if(Lookpick.dialog_closing_state != null)
		{
			Lookpick.stop_dialog_surveillance();
			if(Lookpick.dialog_closing_state == 'accept')
			{
				Lookpick.addEngineToSearchBarCallback();
			}
			Lookpick.dialog_closing_state = null;
		}
	},

	addEngineToSearchBarCallback: function addEngineToSearchBarCallback()
	{
		var title, iconURL, method, formURL, form, node;
		var hidden_fields = [];
		var textfield_name = "";
		var secondary_dynamic_fields = [];
		function addParam(name, value) {
			// Firefox doesn't encode these properly
			name = name.replace(/#/g, "%23").replace(/&/g, "%26");
			value = value.replace(/#/g, "%23").replace(/&/g, "%26");
			hidden_fields.push({'name': name, 'value': value});
		}
		function add_dynamic_field(name)
		{
			name = name.replace(/#/g, "%23").replace(/&/g, "%26");
			secondary_dynamic_fields.push(name);
		}
		var params = [];
		var numButtons = 0;
		// Add the parameters from the form
		for (var i = 0; i < Lookpick.lp_form.elements.length; ++i) {
		var el = Lookpick.lp_form.elements[i];

		if (!el.type) // happens with fieldsets
		continue;

		// only add "successful controls" (see
		// http://www.w3.org/TR/html4/interact/forms.html#successful-controls)
		if(!el.name || el.disabled)
		continue;

		if(el == Lookpick.lp_node) {
		textfield_name = el.name;
		} else {
		var type = el.type.toLowerCase();

		switch(type) {
		  case "image":
		  case "submit":
		    if(numButtons++) // let only the first submit button go through
		      break;
		  case "text":
		  case "hidden":
		  case "textarea":
		  	if(el.value=="%"+(secondary_dynamic_fields.length+2) || el.value=="#"+(secondary_dynamic_fields.length+2)) //allow for multifield lookpicks
		  	{
		  		add_dynamic_field(el.name);
		  	}
		  	else
		  	{
		    	addParam(el.name, el.value);
		    	//addedEngine.addParam(el.name, el.value, null);
		    }
		    break;
		  case "checkbox":
		  case "radio":
		    if(el.checked) {
		      addParam(el.name, el.value);
		      //addedEngine.addParam(el.name, el.value, null);
		      break;
		    }
		  default:
		    if(el instanceof HTMLSelectElement && el.selectedIndex >= 0) {
		      for(var j = 0; j < el.options.length; ++j) {
			if (el.options[j].selected) {
			  addParam(el.name, el.options[j].value);
			  //addedEngine.addParam(el.name, el.options[j].value, null);
			}
		      }
		    }
		}

	      }
	    }
		var charset = Lookpick.lp_form.acceptCharset;
		if(charset) { // pick the first charset mentioned in the accept-charset attr
		if(charset.indexOf(" ") != -1)
		charset = charset.substring(0, charset.indexOf(" "));
		if(charset.indexOf(",") != -1)
		charset = charset.substring(0, charset.indexOf(","));
		}

		var lookpick = new Object;
		lookpick.title = Lookpick.lp_title;
		lookpick.description = Lookpick.lp_description;
		lookpick.method = Lookpick.lp_method;
		lookpick.url = Lookpick.lp_url;
		lookpick.field_name = textfield_name;
		lookpick.fields = hidden_fields;
		if(secondary_dynamic_fields.length > 0)
		{
			lookpick.secondary_dynamic_fields = secondary_dynamic_fields;
		}
		Lookpick.WebMethod("http://"+Lookpick.HOST+"/boxes/create_via_extension","lookpick="+encodeURIComponent(Lookpick.JSON.toString(lookpick)), Lookpick.create_lookpick_callback, true, null, true);
	},

	onBrowserPageLoad: function onBrowserPageLoad(evt) {
		Lookpick.detect_opensearch_plugins();
		//var sb = Cc["@mozilla.org/sidebar;1"].getService(Ci.nsISidebar);
		var doc = evt.originalTarget; // doc is document that triggered "onload" event
		if(doc.location.href.search(Lookpick.HOST) > -1 && Lookpick.first_load == false)//if possible add more restrictions so it isnt fired too often
		{
			//check if the user just logged out so we can reset the extension
			var after_logout = false;
			var var_string = doc.location.href.split("?")[1];
			if(var_string)
			{
				var vars = var_string.split("&");
				for (var i=0;i<vars.length;i++) {
				    var kv = vars[i].split("=");
				    if (kv[0] == 'after_logout') {
				      after_logout = true;
				    }
				}
			}
			if(Lookpick.current_lookpick==null || after_logout)
			{
				Lookpick.refresh_lookup_list(after_logout);
			}
		}
		else
		{
			Lookpick.first_load = false;
		}
	},

	detect_opensearch_plugins: function detect_opensearch_plugins()
	{
		var addengines = Lookpick.get_detected_engines();
		if(Lookpick.search_boxes != null) var boxes = "--"+Lookpick.search_boxes.join('--')+"--";
		var new_engines = false;
		if(addengines)
		{
			for(var i=0; i<addengines.length; i++)
			{
				if(addengines[i] && (boxes.indexOf("--"+addengines[i].title+"--")==-1 && boxes.indexOf("--"+addengines[i].title+" | ")==-1)) new_engines = true;
			}
		}
		if(new_engines)
		{
			document.getElementById("lookpick-selector-button").setAttribute("addengines", "true");
		}
		else
		{
			document.getElementById("lookpick-selector-button").removeAttribute("addengines");
		}
	},

	rebuild_selector_popup: function rebuild_selector_popup()
	{
		//clear old ones
		var menu = document.getElementById('searchbar-popup');
		var items = menu.childNodes;
		for (var i = items.length - 1; i >= 0; i--) {
            if (items[i].getAttribute("class").indexOf("addengine") != -1)
              menu.removeChild(items[i]);
		}
		//add new ones
		var addengines = Lookpick.get_detected_engines();
		if(addengines && addengines.length>0)
		{
			//setup a menu item to add a detected engine
			const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

			var separator = document.createElementNS(XUL_NS, "menuseparator");
            separator.setAttribute("class", "addengine-separator");
            menu.insertBefore(separator, menu.lastChild);
			var boxes = "--"+Lookpick.search_boxes.join('--')+"--";
            var nothing_added = true;
			for(var i=0; i<addengines.length; i++)
			{
				var e = addengines[i];
				if(boxes.indexOf("--"+e.title+"--")==-1 && boxes.indexOf("--"+e.title+" | ")==-1)
				{
					var item = document.createElementNS(XUL_NS, 'menuitem');
					item.setAttribute('label', "Add '"+e.title+"'");
					item.setAttribute('class', 'menuitem-iconic addengine-item');
					item.setAttribute('image', e.icon);
					item.setAttribute('oncommand', "Lookpick.add_engine_from_opensearch_xml('"+e.uri+"','"+e.title+"')");
					menu.insertBefore(item, menu.lastChild);
					nothing_added = false;
				}
			}
			if(nothing_added)
			{
				for (var i = items.length - 1; i >= 0; i--) {
	            	if (items[i].getAttribute("class").indexOf("addengine-separator") != -1)
					menu.removeChild(items[i]);
				}
			}
		}
	},

	get_detected_engines: function get_detected_engines()
	{
		return getBrowser().mCurrentBrowser.engines;
	},

	add_engine_from_opensearch_xml: function add_engine_from_opensearch_xml(url, title)
	{
		Lookpick.list_properties(window.getBrowser().webNavigation.document.location);
		var loc = window.getBrowser().webNavigation.document.location;
		var host = loc.host;
		host = loc.href.substr(0, loc.href.indexOf(loc.host)+loc.host.length);
		Lookpick.WebMethod("http://"+Lookpick.HOST+"/boxes/create_from_opensearch_description","url="+encodeURIComponent(url)+"&title="+encodeURIComponent(title)+"&host="+host, Lookpick.create_lookpick_callback, true, null, true);
	},


	list_properties: function list_properties(obj)
	{//just a convenience method for debugging
		var strng = "";
		var ii = 0;
		for(i in obj)
		{
			try{
			strng += (i+"="+obj[i]+"\n");
			ii++;
			}catch(e){}
			if(ii>9)
			{
				ii=0;
				dump(strng+"\n");
				strng="";
			}
		}
		dump(strng+"\n");
	}
};
window.addEventListener("load", function(e) { Lookpick.init(); }, false);
window.addEventListener("unload", function() {Lookpick.uninit()}, false);

  /**
   * Update the browser UI to show whether or not additional engines are
   * available when a page is loaded or the user switches tabs to a page that
   * has search engines. --Taken from browser.js, and adapted.
   */
  BrowserSearch.updateSearchButton = function() {
    var searchBar = document.getElementById('searchbar-orig');//this.searchBar;

    // The search bar binding might not be applied even though the element is
    // in the document (e.g. when the navigation toolbar is hidden), so check
    // for .searchButton specifically.
    //if (!searchBar || !searchBar.searchButton)
    if (!searchBar || !document.getElementById('lookpick-selector-button'))
      return;

    var engines = gBrowser.mCurrentBrowser.engines;
    if (engines && engines.length > 0)
    {
      searchBar.searchButton.setAttribute("addengines", "true");
    }
    else
      searchBar.searchButton.removeAttribute("addengines");
  }

var myExt_urlBarListener = {
  QueryInterface: function(aIID)
  {
   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
       aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
       aIID.equals(Components.interfaces.nsISupports))
     return this;
   throw Components.results.NS_NOINTERFACE;
  },

  onLocationChange: function(aProgress, aRequest, aURI)
  {
  	Lookpick.detect_opensearch_plugins();
  },

  onStateChange: function() {},
  onProgressChange: function() {},
  onStatusChange: function() {},
  onSecurityChange: function() {},
  onLinkIconAvailable: function() {}
};

	var textfield_drop_observer = {
        getSupportedFlavours: function () {
          var flavourSet = new FlavourSet();
          flavourSet.appendFlavour("text/unicode");
          return flavourSet;
        },
	   	onDrop: function(evt,dropdata, session)
	   	{
	   		var string='';
	   		var field = document.getElementById('searchbar-lp');
	   			string = dropdata.data;
   			field.value = string.replace(/^\s+|\s+$/g, '');

	   		Lookpick.handle_textfield_submit(field, true);
	  	},
	  	onDragEnter: function(evt, flavour, session)
	  	{
	  		Lookpick.textfield_value_tmp = evt.target.value;
			evt.target.value = '';
	  	},
	  	onDragExit: function(evt, session)
	  	{
			if(evt.target.value == '') evt.target.value = Lookpick.textfield_value_tmp;
	  	}
	};
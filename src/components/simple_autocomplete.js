/* ***** BEGIN LICENSE BLOCK *****
 * Version: MIT
 *
 * The MIT License
 * 
 * Copyright (c) 2007 Johannes Stein and others
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * Based on http://developer.mozilla.org/en/docs/How_to_implement_custom_autocomplete_search_component
 *
 * Contributor(s):
 *   Johannes Stein <johannes@unsyn.com>
 *
 * ***** END LICENSE BLOCK ***** */

const Ci = Components.interfaces;

const CLASS_ID = Components.ID("6224daa1-71a2-4d1a-ad90-01ca1c08e323");
const CLASS_NAME = "Simple AutoComplete";
const CONTRACT_ID = "@mozilla.org/autocomplete/search;1?name=simple-autocomplete";

// Implements nsIAutoCompleteResult
function SimpleAutoCompleteResult(searchString, searchResult,
                                  defaultIndex, errorDescription,
                                  results, comments) {
  this._searchString = searchString;
  this._searchResult = searchResult;
  this._defaultIndex = defaultIndex;
  this._errorDescription = errorDescription;
  this._results = results;
  this._comments = comments;
}

SimpleAutoCompleteResult.prototype = {
  _searchString: "",
  _searchResult: 0,
  _defaultIndex: 0,
  _errorDescription: "",
  _results: [],
  _comments: [],

  /**
   * The original search string
   */
  get searchString() {
    return this._searchString;
  },

  /**
   * The result code of this result object, either:
   *         RESULT_IGNORED   (invalid searchString)
   *         RESULT_FAILURE   (failure)
   *         RESULT_NOMATCH   (no matches found)
   *         RESULT_SUCCESS   (matches found)
   */
  get searchResult() {
    return this._searchResult;
  },

  /**
   * Index of the default item that should be entered if none is selected
   */
  get defaultIndex() {
    return this._defaultIndex;
  },

  /**
   * A string describing the cause of a search failure
   */
  get errorDescription() {
    return this._errorDescription;
  },

  /**
   * The number of matches
   */
  get matchCount() {
    return this._results.length;
  },

  /**
   * Get the value of the result at the given index
   */
  getValueAt: function(index) {
    return this._results[index];
  },

  /**
   * Get the comment of the result at the given index
   */
  getCommentAt: function(index) {
    return this._comments[index];
  },

  /**
   * Get the style hint for the result at the given index
   */
  getStyleAt: function(index) {
    if (!this._comments[index])
      return null;  // not a category label, so no special styling

    if (index == 0)
      return "suggestfirst";  // category label on first line of results

    return "suggesthint";   // category label on any other line of results
  },
  
  /**
   * Just a stub. No images needed.
   */
  getImageAt: function(index) {
  	return null;
  },

  /**
   * Remove the value at the given index from the autocomplete results.
   * If removeFromDb is set to true, the value should be removed from
   * persistent storage as well.
   */
  removeValueAt: function(index, removeFromDb) {
    this._results.splice(index, 1);
    this._comments.splice(index, 1);
  },

  QueryInterface: function(aIID) {
    if (!aIID.equals(Ci.nsIAutoCompleteResult) && !aIID.equals(Ci.nsISupports))
        throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  }
};


// Implements nsIAutoCompleteSearch
function SimpleAutoCompleteSearch() {
}
SimpleAutoCompleteSearch.prototype = {
  /*
   * Search for a given string and notify a listener (either synchronously
   * or asynchronously) of the result
   *
   * @param searchString - The string to search for
   * @param searchParam - An extra parameter
   * @param previousResult - A previous result to use for faster searchinig
   * @param listener - A listener to notify when the search is complete
   */
  startSearch: function(searchString, searchParam, result, listener) {
    // This autocomplete source assumes the developer attached a JSON string
    // to the the "autocompletesearchparam" attribute or "searchParam" property
    // of the <textbox> element. The JSON is converted into an array and used
    // as the source of match data. Any values that match the search string
    // are moved into temporary arrays and passed to the AutoCompleteResult
    if (searchParam.length > 0) {
    var data = ["local",""]
      try{
      //Components.utils.reportError("Error");
        data = SimpleAutoCompleteSearch.JSON.parse(searchParam);
      }catch(e){}
      var type = data[0];
      var searchResults = data[1];
      
      if(type == "remote")
      {
      	var url = data[2];
      	var query_var = data[3];
      	if(query_var != "")//classic url construction
      	{
      		var separator = url.toString().indexOf("?") == -1 ? "?" : "&";
      		url = url + separator + query_var + "=" + searchString;
      	}else//opensearch style url construction
      	{
      		url = url.toString();//needed to avoid error on next line (is of type object before).
      		url = url.replace("{searchTerms}", searchString);
      	}
      	
     	var http = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
		http.open("GET",url,false);//synchronous request, keeps things simple and doesnt do any harm here afaics
		http.setRequestHeader('Content-Type','application/x-suggestions+json');
		http.send('');
		var resp = http.responseText;
		var resp_obj = ["remote", ["Autocompletion error! Check this lookpick."]];
		try{
		  resp_obj = SimpleAutoCompleteSearch.JSON.parse(resp);
		}catch(e){}
		searchResults = resp_obj[1];
      	//return;
      }
      var results = [];
      var comments = [];
		var query = searchString.toLowerCase();
      for (i=0; i<searchResults.length; i++) {
		//var words = words.concat(searchResults[i].comment.toLowerCase().split(/[\b-\/]/));
		if(type == "remote")
		{
			results.push(searchResults[i])
			comments.push(null);
		}else
		{
			var added = false;
			var words = searchResults[i].toLowerCase().split(/[\b-\/]/);
			for(var ii=0; ii<words.length; ii++)
			{
				if(words[ii].indexOf(query)==0 && added == false)
				{
					results.push(searchResults[i]);
					added = true;
					comments.push(null);
					break;
				}
			}
			if(added == false && (searchResults[i].toLowerCase().indexOf(query)!=-1 /*|| searchResults[i].comment.toLowerCase().indexOf(query)!=-1*/) && query.match(/[\b-\/.]/)!=null)
			{//see if more than just one word is matching. only if certain characters are in query, that suggest its more than one word. in rare cases it returns too much. worth changing? don't htink so.
				results.push(searchResults[i]);
				added = true;
				comments.push(null);
				break;
			}
		}
      }
      var newResult = new SimpleAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_SUCCESS, 0, "", results, comments);
      listener.onSearchResult(this, newResult);
    }
  },

  /*
   * Stop an asynchronous search that is in progress
   */
  stopSearch: function() {
  },
  
  QueryInterface: function(aIID) {
    if (!aIID.equals(Ci.nsIAutoCompleteSearch) && !aIID.equals(Ci.nsISupports))
        throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  }
};

//limited scope for better compatibility with other legacy add-ons
if(typeof(JSON) == "undefined")
{//ff3.0
	Components.utils.import("resource://gre/modules/JSON.jsm", SimpleAutoCompleteSearch);
	SimpleAutoCompleteSearch.JSON.parse = SimpleAutoCompleteSearch.JSON.fromString;
	SimpleAutoCompleteSearch.JSON.stringify = SimpleAutoCompleteSearch.JSON.toString;
}
else
{//ff3.1
	SimpleAutoCompleteSearch.JSON = {};
	SimpleAutoCompleteSearch.JSON.parse = JSON.parse;
	SimpleAutoCompleteSearch.JSON.stringify = JSON.stringify;
}

// Factory
var SimpleAutoCompleteSearchFactory = {
  singleton: null,
  createInstance: function (aOuter, aIID) {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    if (this.singleton == null)
      this.singleton = new SimpleAutoCompleteSearch();
    return this.singleton.QueryInterface(aIID);
  }
};

// Module
var SimpleAutoCompleteSearchModule = {
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
  },

  unregisterSelf: function(aCompMgr, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
  },
  
  getClassObject: function(aCompMgr, aCID, aIID) {
    if (!aIID.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    if (aCID.equals(CLASS_ID))
      return SimpleAutoCompleteSearchFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

// Module initialization
function NSGetModule(aCompMgr, aFileSpec)
{
	return SimpleAutoCompleteSearchModule;
}


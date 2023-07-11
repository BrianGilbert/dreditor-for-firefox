/**
 * Dreditor 1.2.20
 * https://dreditor.org
 * An extension for Drupal.org that enhances user experience and functionality. Original author: Daniel F. Kudwien (sun).
 * Licensed under GPL-2.0
 *
 * Maintainers:
 *   Mark Carver - https://drupal.org/user/501638
 *   Scott Reeves (Cottser) - https://drupal.org/user/1167326
 *   Daniel F. Kudwien (sun) - https://drupal.org/user/54136
 *
 * Last build: 2016-07-21 11:20:57 PM EDT
 */
/**
 * Content Scope Runner.
 *
 * While Firefox/GreaseMonkey supports advanced DOM manipulations, Chrome does
 * not. For maximum browser compatibility, this user script injects itself into
 * the page it is executed on.
 *
 * Support and available features for user scripts highly varies across browser
 * vendors. Some browsers (e.g., Firefox) require to install a browser extension
 * (GreaseMonkey) in order to install and execute user scripts. Some others
 * have built-in support for user scripts, but do not support all features of
 * GreaseMonkey (variable storage, cross-domain XHR, etc). In the special case
 * of Chrome, user scripts are executed before the DOM has been fully loaded and
 * initialized; they can only access and manipulate the plain DOM document as
 * is, but none of the scripts on the actual page are loaded yet.
 *
 * Bear in mind, with Content Scope Runner, unsafeWindow and all other
 * GreaseMonkey specific features are not available.
 *
 * The global __PAGE_SCOPE_RUN__ variable is prepended to the user script to
 * control execution. Make sure this variable does not clash with actual page
 * variables.
 *
 * @see http://userscripts.org/scripts/show/68059
 * @see http://wiki.greasespot.net/Content_Scope_Runner
 *
 * @todo FIXME upstream:
 *   - Bogus SCRIPT type attribute.
 *   - data attribute throws MIME type warning in Chrome; textContent approach
 *     of earlier versions is correct.
 *   - Append to HEAD.
 *   - Removal/clean-up is completely invalid.
 *   - setTimeout() approach seems useless?
 *   - Code comments.
 */
/*jshint ignore:start*/
var dreditor_loader = function ($) {
/*jshint ignore:end*/
Drupal.dreditor = {
  version: '1.2.20',
  behaviors: {},
  setup: function () {
    var self = this;

    // Reset scroll position.
    delete self.scrollTop;

    // Prevent repeated setup (not supported yet).
    if (self.$dreditor) {
      self.show();
      return;
    }
    // Setup Dreditor overlay.
    self.$wrapper = $('<div id="dreditor-wrapper"></div>').css({ height: 0 });
    // Add Dreditor content area.
    self.$dreditor = $('<div id="dreditor"></div>').appendTo(self.$wrapper);
    self.$wrapper.appendTo('body');

    // Setup Dreditor context.
    Drupal.dreditor.context = self.$dreditor.get(0);

    // Add sidebar.
    var $bar = $('<div id="bar"><div class="resizer"></div></div>').prependTo(self.$dreditor);
    // Add ul#menu to sidebar by default for convenience.
    $('<h3>Diff outline</h3>').appendTo($bar);
    $('<ul id="menu"></ul>').appendTo($bar);

    // Allow bar to be resizable.
    self.resizable($bar);

    // Add the content region.
    $('<div id="dreditor-content"></div>').appendTo(self.$dreditor);

    // Add global Dreditor buttons container.
    var $actions = $('<div id="dreditor-actions"></div>');
    // Add hide/show button to temporarily dismiss Dreditor.
    $('<input id="dreditor-hide" class="dreditor-button" type="button" value="Hide" />')
      .click(function () {
        if (self.visible) {
          self.hide();
        }
        else {
          self.show();
        }
      })
      .appendTo($actions);
    // Add cancel button to tear down Dreditor.
    $('<input id="dreditor-cancel" class="dreditor-button" type="button" value="Cancel" />')
      .click(function () {
        if (Drupal.dreditor.patchReview.comment.comments.length === 0 || window.confirm('Do you really want to cancel Dreditor and discard your changes?')) {
          Drupal.dreditor.tearDown();
        }
        return;
      })
      .appendTo($actions);
    $actions.appendTo(self.$dreditor);

    // Allow to hide Dreditor using the ESC key.
    $(document).bind('keyup', { dreditor: self }, self.escapeKeyHandler);

    // Setup application.
    var args = arguments;
    // Cut out the application name (2nd argument).
    this.application = Array.prototype.splice.call(args, 1, 1)[0];
    // Remove global window context; new context is added by attachBehaviors().
    args = Array.prototype.slice.call(args, 1);
    this.attachBehaviors(args);

    // Display Dreditor.
    self.show();
  },

  resizable: function ($bar) {
    var self = this;
    var $resizer = $bar.find('.resizer');
    var minWidth = 230;
    var maxWidth = self.$dreditor.width() / 2;
    var currentWidth = Drupal.storage.load('barWidth') || minWidth;
    var resizing = false;

    // Ensure that the maximum width is calculated on window resize.
    $(window).bind('resize', function () {
      maxWidth = self.$dreditor.width() / 2;
    });

    // Limit widths to minimum and current maximum.
    var checkWidth = function (width) {
      if (width < minWidth) {
        width = minWidth;
      }
      if (width > maxWidth) {
        width = maxWidth;
      }
      return width;
    };

    // Initialize the current width of the bar.
    $bar.width(checkWidth(currentWidth));

    // Bind the trigger for actually instantiating a resize event.
    $resizer
      .bind('mousedown', function () {
        if (!resizing) {
          resizing = true;
          $resizer.addClass('resizing');
          self.$dreditor.addClass('resizing');
        }
      });

    // Bind the mouse movements to the entire $dreditor div to accommodate
    // fast mouse movements.
    self.$dreditor
      .bind('mousemove', function (e) {
        if (resizing) {
          currentWidth = checkWidth(e.clientX);
          $bar.width(currentWidth);
        }
      })
      .bind('mouseup', function () {
        if (resizing) {
          resizing = false;
          $resizer.removeClass('resizing');
          self.$dreditor.removeClass('resizing');
          Drupal.storage.save('barWidth', currentWidth);
        }
      });
  },

  tearDown: function (animate) {
    animate = typeof animate !== 'undefined' ? animate : true;
    var self = this;

    // Remove the ESC keyup event handler that was bound in self.setup().
    $(document).unbind('keyup', self.escapeKeyHandler);
    if (animate) {
      self.$wrapper.animate({ height: 0 }, 300, function(){
        $(this).hide();
        $('body').css({ overflow: 'auto' });
      });
      setTimeout(function(){
        self.$wrapper.stop(true, true).css('height', 0).remove();
        delete self.$dreditor;
        delete self.$wrapper;
      }, 500);
    }
    else {
      self.$wrapper.remove();
      delete self.$dreditor;
      delete self.$wrapper;
    }
  },

  /**
   * Dreditor visibility state.
   */
  visible: false,

  /**
   * Hide Dreditor.
   */
  hide: function () {
    var self = this;
    self.visible = false;
    // Backup current vertical scroll position of Dreditor content.
    self.scrollTop = self.$dreditor.find('#dreditor-content').scrollTop();

    var button = self.$dreditor.find('#dreditor-hide').get(0);
    button.value = 'Show';

    self.$wrapper.stop(true).animate({ height: 34 }, function () {
      self.$dreditor.find('> div:not(#dreditor-actions)').hide();
      $('body').css({ overflow: 'auto' });
    });
    return false;
  },

  /**
   * Show Dreditor.
   */
  show: function () {
    var self = this;
    self.visible = true;

    var button = self.$dreditor.find('#dreditor-hide').get(0);
    self.$dreditor.find('> div:not(#dreditor-actions)').show();

    $('body').css({ overflow: 'hidden' });
    self.$wrapper.stop(true).animate({ height: '100%' }, function () {
      button.value = 'Hide';
    });

    // Restore previous vertical scroll position of Dreditor content.
    if (self.scrollTop) {
      self.$dreditor.find('#dreditor-content').scrollTop(self.scrollTop);
    }
    return false;
  },

  /**
   * Key event handler to hide or show Dreditor.
   */
  escapeKeyHandler: function (event) {
    var self = event.data.dreditor;
    if (event.which === 27) {
      if (self.visible) {
        self.hide();
      }
      else {
        self.show();
      }
    }
  },

  attachBehaviors: function (args) {
    if (args === undefined || typeof args !== 'object') {
      args = [];
    }
    // Add Dreditor context as first argument.
    Array.prototype.unshift.call(args, Drupal.dreditor.context);
    // Apply application behaviors, passing any additional arguments.
    $.each(Drupal.dreditor[this.application].behaviors, function () {
      this.apply(Drupal.dreditor.context, args);
    });
    // Apply Dreditor behaviors.
    $.each(Drupal.dreditor.behaviors, function () {
      this(Drupal.dreditor.context);
    });
    // Apply Drupal behaviors.
    Drupal.attachBehaviors(Drupal.dreditor.context);
  },

  /**
   * Parse CSS classes of a DOM element into parameters.
   *
   * Required, because jQuery.data() somehow seems to forget about previously
   * stored data in DOM elements; most probably due to context mismatches.
   *
   * Syntax for CSS classes is "<prefix>-name-value".
   *
   * @param element
   *   A DOM element containing CSS classes to parse.
   * @param prefix
   *   The parameter prefix to search for.
   */
  getParams: function(element, prefix) {
    var classes = element.className.split(' ');
    var length = prefix.length;
    var params = {};
    for (var i in classes) {
      if (classes[i].substr(0, length + 1) === prefix + '-') {
        var parts = classes[i].split('-');
        var value = parts.slice(2).join('-');
        params[parts[1]] = value;
        // Convert numeric values.
        if (parseInt(value, 10) === value) {
          params[parts[1]] = parseInt(value, 10);
        }
      }
    }
    return params;
  },

  /**
   * Jump to a fragment/hash in the document, skipping the browser's history.
   *
   * To be used for jump links within Dreditor overlay only.
   */
  goto: function (selector) {
    if (!(typeof selector === 'string' && selector.length)) {
      return;
    }
    // @todo Does not work because of overflow: hidden.
    //window.scrollTo(0, $(selector).offset().top);
    // Gecko-only method to scroll DOM elements into view.
    // @see https://developer.mozilla.org/en/DOM/element.scrollIntoView
    var $target = $(selector);
    if ($target.length) {
      $target.get(0).scrollIntoView();
    }
    else if (typeof window.console.warn !== 'undefined') {
      window.console.warn(selector + ' does not exist.');
    }
  },

  /**
   * Redirect to a given path or the current page.
   *
   * Avoids hard browser refresh (clearing cache).
   *
   * @param path
   *   (optional) The path to redirect to, including leading slash. Defaults to
   *   current path.
   * @param options
   *   (optional) An object containing:
   *   - query: A query string to append, including leading question mark
   *     (window.location.search). Defaults to current query string.
   *   - fragment: A fragment string to append, including leading pound
   *     (window.location.hash). Defaults to none.
   */
  redirect: function (path, options) {
    path = path || window.location.pathname;
    options = $.extend({ fragment: '' }, options || {});
    var url = window.location.protocol + '//' + window.location.hostname + path;
    // If query is not null, take it; otherwise, use current.
    url += (typeof options.query !== 'undefined' ? options.query : window.location.search);
    // Not using current fragment by default.
    if (options.fragment.length) {
      url += options.fragment;
    }
    window.location.href = url;
    return false;
  }
};

Drupal.cache = {
  /**
   * Provide a default value if needed
   *
   * @param {String} cache
   *   Cache ID or nothing
   * @returns {String}
   *   Cache ID
   */
  getCache : function(cache) {
    return cache ? cache : 'cache';
  },
  /**
   * The key to use for storage.
   *
   * @param {String} cache
   * @param {String} id
   * @returns {String}
   */
  getKey : function(cache, id) {
    return cache + '_' + id;
  },
  /**
   * List of key for particular cache.
   *
   * @param {String} cache
   * @returns {Array}
   */
  getKeys : function(cache) {
    cache = this.getCache(cache);
    var keys = Drupal.storage.load(cache);
    return keys ? keys : [];
  },

  /**
   * Store a key/value pair in a particular cache maybe expirable.
   *
   * @param {String} id
   * @param {any} data
   *   Data item to store
   * @param {String} cache
   *   Named cache bin
   * @param {integer} expire
   *   Value Data.now() + millisecond or CACHE_PERMANENT === 0
   *
   * @see https://api.drupal.org/api/drupal/includes!cache.inc/function/cache_set/7
   */
  set : function(id, data, cache, expire) {
    cache = this.getCache(cache);
    expire = expire || 0;
    // Prepend key with it's cache
    var key = this.getKey(cache, id);
    // Grab lookup for comparing keys
    var keys = this.getKeys(cache);
    if (keys.indexOf(key) === -1) {
      keys.push(key);
    }
    // Save both cachekeys and cachable data @see Drupal.cache
    var item = {data: data, expire: expire};
    Drupal.storage.save(key, item);
    Drupal.storage.save(cache, keys);
  },
  /**
   * Get item from particular cache with given id.
   *
   * @param {String} id
   * @param {String} cache
   * @returns {any|null}
   */
  get : function(id, cache) {
    cache = this.getCache(cache);
    var keys = this.getKeys(cache);
    var key = this.getKey(cache, id);
    if (keys.indexOf(key) > -1) {
      var item = Drupal.storage.load(key);
      if (item.expire === 0 || item.expire > Date.now()) {
        return item.data;
      }
    }
    return null;
  },
  /**
   * Clears the given (or default) cache
   *
   * @param {String|null} cache
   */
  clear : function(cache) {
    cache = this.getCache(cache);
    var keys = this.getKeys(cache);
    // Delete data.
    $.each(keys, function(i, value) {
      Drupal.storage.remove(value);
    });
    // Remove the cache itself.
    Drupal.storage.remove(cache);
  }
};

jQuery.fn.extend({
  debug: function () {
    // Initialize window.debug storage, to make debug data accessible later
    // (e.g., via browser console). Although we are going to possibly store
    // named keys, this needs to be an Array, so we can determine its length.
    window.debug = window.debug || [];

    var name, data, args = jQuery.makeArray(arguments);
    // Determine data source; this is an object for $variable.debug().
    // Also determine the identifier to store data with.
    if (typeof this === 'object') {
      name = (args.length ? args[0] : window.debug.length);
      data = this;
    }
    else {
      name = (args.length > 1 ? args.pop() : window.debug.length);
      data = args[0];
    }
    // Store data.
    window.debug[name] = data;
    // Dump data into Firebug console.
    if (typeof window.console !== 'undefined') {
      window.console.log(name, data);
    }
    return this;
  }
});

Drupal.dreditor.form = {
  forms: [],

  create: function (form_id) {
    return new this.form(form_id);
  }
};

Drupal.dreditor.form.form = function (form_id) {
  var self = this;

  // Turn this object into a jQuery object, being a form. :)
  $.extend(true, self, $('<form id="' + form_id + '"></form>'));

  // Override the default submit handler.
  self.submit(function () {
    // Unless proven wrong, we remove the form after submission.
    self.remove();
    // We never really submit.
    return false;
  });
};

Drupal.dreditor.form.form.prototype = {
  submitHandlers: {},

  addButton: function (op, onSubmit) {
    var self = this;
    self.submitHandlers[op] = onSubmit;
    var $button = $('<input name="op" class="dreditor-button" type="button" value="' + op + '" />');
    $button.bind('click.form', function () {
      self.submitHandlers[op].call(self, $button);
    });
    this.append($button);
    // Return the jQuery form object to allow for chaining.
    return this;
  }
};

var sortOrder, hasDuplicate;
if ( document.documentElement && document.documentElement.compareDocumentPosition ) {
  sortOrder = function( a, b ) {
    if (a && b && a.compareDocumentPosition) {
      var ret = a.compareDocumentPosition(b) & 4 ? -1 : a === b ? 0 : 1;
      if ( ret === 0 ) {
        hasDuplicate = true;
      }
      return ret;
    }
  };
} else if ( "sourceIndex" in document.documentElement ) {
  sortOrder = function( a, b ) {
    var ret = a.sourceIndex - b.sourceIndex;
    if ( ret === 0 ) {
      hasDuplicate = true;
    }
    return ret;
  };
} else if ( document.createRange ) {
  sortOrder = function( a, b ) {
    var aRange = a.ownerDocument.createRange(), bRange = b.ownerDocument.createRange();
    aRange.selectNode(a);
    aRange.collapse(true);
    bRange.selectNode(b);
    bRange.collapse(true);
    var ret = aRange.compareBoundaryPoints(window.Range.START_TO_END, bRange);
    if ( ret === 0 ) {
      hasDuplicate = true;
    }
    return ret;
  };
}
// end sortOrder

Drupal.storage = {};

/**
 * Checks support for a client-side data storage bin.
 *
 * @param bin
 *   The space to store in, one of 'session', 'local', 'global'.
 */
Drupal.storage.isSupported = function (bin) {
  try {
    return bin + 'Storage' in window && window[bin + 'Storage'] !== null;
  }
  catch (e) {
    return false;
  }
};

Drupal.storage.support = {
  session: Drupal.storage.isSupported('session'),
  local: Drupal.storage.isSupported('local'),
  global: Drupal.storage.isSupported('global')
};

/**
 * Loads data from client-side storage.
 *
 * @param key
 *   The key name to load stored data from. Automatically prefixed with
 *   "Dreditor.".
 * @param bin
 *   (optional) A string denoting the storage space to read from. Defaults to
 *   'local'. See Drupal.storage.save() for details.
 *
 * @return {any}
 *   The data stored or null.
 *
 * @see Drupal.storage.save()
 */
Drupal.storage.load = function (key, bin) {
  if (typeof bin === 'undefined') {
    bin = 'local';
  }
  if (!Drupal.storage.support[bin]) {
    return false;
  }
  key = 'Dreditor.' + key;
  var item = window[bin + 'Storage'].getItem(key);
  if (item) {
    return window.JSON.parse(item);
  }
  return null;
};

/**
 * Stores data on the client-side.
 *
 * @param key
 *   The key name to store data under. Automatically prefixed with "Dreditor.".
 *   Should be further namespaced by module; e.g., for
 *   "Dreditor.moduleName.settingName" you pass "moduleName.settingName".
 * @param data
 *   The data to store.
 * @param bin
 *   (optional) A string denoting the storage space to store data in:
 *   - session: Reads from window.sessionStorage. Persists for currently opened
 *     browser window/tab only.
 *   - local: Reads from window.localStorage. Stored values are only available
 *     within the scope of the current host name only.
 *   - global: Reads from window.globalStorage.
 *   Defaults to 'local'.
 *
 * @return {Boolean}
 *   Indicates saving succeded or not.
 * @see Drupal.storage.load()
 */
Drupal.storage.save = function (key, data, bin) {
  if (typeof bin === 'undefined') {
    bin = 'local';
  }
  if (!Drupal.storage.support[bin]) {
    return false;
  }
  key = 'Dreditor.' + key;
  window[bin + 'Storage'].setItem(key, window.JSON.stringify(data));
  return true;
};

/**
 * Delete data from client-side storage.
 *
 * Called 'remove', since 'delete' is a reserved keyword.
 *
 * @param key
 *   The key name to delete. Automatically prefixed with "Drupal.".
 * @param bin
 *   (optional) The storage space name. Defaults to 'session'.
 *
 * @see Drupal.storage.save()
 */
Drupal.storage.remove = function (key, bin) {
  if (typeof bin === 'undefined') {
    bin = 'local';
  }
  if (!Drupal.storage.support[bin]) {
    return false;
  }
  key = 'Dreditor.' + key;
  return window[bin + 'Storage'].removeItem(key);
};

/**
 * Parses a stored value into its original data type.
 *
 * HTML5 storage always stores values as strings. This is a "best effort" to
 * restore data type sanity.
 */
Drupal.storage.parse = function (val) {
  // Convert numbers.
  if (/^[0-9.]+$/.test(val)) {
    val = parseFloat(val);
  }
  // Convert booleans.
  else if (val === 'true') {
    val = true;
  }
  else if (val === 'false') {
      val = false;
    }
  return val;
};

/**
 * Serializes a value suitable for client-side (string) storage.
 */
Drupal.storage.serialize = function (val) {
  return $.param(val);
};

/**
 * Unserializes a $.param() string.
 *
 * Note that this only supports simple values (numbers, booleans, strings)
 * and only an one-dimensional (flat) associative configuration object (due to
 * limitations of jQuery.param()).
 */
Drupal.storage.unserialize = function (str) {
  var obj = {};
  jQuery.each(str.split('&'), function() {
    var splitted = this.split('=');
    if (splitted.length !== 2) {
      return;
    }
    var key = decodeURIComponent(splitted[0]);
    var val = decodeURIComponent(splitted[1].replace(/\+/g, ' '));
    val = Drupal.storage.parse(val);

    // Ignore empty values.
    if (typeof val === 'number' || typeof val === 'boolean' || val.length > 0) {
      obj[key] = val;
    }
  });
  return obj;
};

Drupal.dreditor.updateCheck = function () {
  if (window.location.hostname === 'dreditor.org') {
    return;
  }
  // Do not update check for any webkit based browsers, they are extensions and
  // are automatically updated.
  if (jQuery.browser.webkit) {
    return;
  }

  var now = new Date();
  // Time of the last update check performed.
  var lastUpdateCheck = Drupal.storage.load('lastUpdateCheck');

  // Do not check for updates if the user just installed Dreditor.
  if (lastUpdateCheck === null) {
    Drupal.storage.save('lastUpdateCheck', now.getTime());
    return;
  }
  else {
    lastUpdateCheck = new Date(lastUpdateCheck);
  }

  // Check whether it is time to check for updates (one a week).
  var interval = 1000 * 60 * 60 * 24 * 7;
  // Convert to time; JS confuses timezone offset in ISO dates with seconds.
  if (lastUpdateCheck.getTime() + interval > now.getTime()) {
    return;
  }

  // Save that a update check was performed.
  // Was previously only saved when the user confirmed or when the commit log
  // could not be parsed. But if the user does not confirm (cancels), the update
  // would run on every page load again.
  Drupal.storage.save('lastUpdateCheck', now.getTime());

  var latestVersion, installedVersion = Drupal.dreditor.version;
  // Determine the latest tagged release from GitHub API.
  $.getJSON('https://api.github.com/repos/unicorn-fail/dreditor/tags', function (json) {
    for (var i = 0; i < json.length; i++) {
      // Find the latest stable release (no "rc", "beta" or "dev" releases).
      if (json[i].name.indexOf('rc') === -1 && json[i].name.indexOf('beta') === -1 && json[i].name.indexOf('dev') === -1) {
        latestVersion = json[i].name;
        break;
      }
    }
    if (latestVersion > installedVersion) {
      if (window.confirm('A new version of Dreditor is available: ' + latestVersion + '. Your current installed version of Dreditor is: ' + installedVersion + '. Would you like to visit https://dreditor.org and update?')) {
        window.open('https://dreditor.org', 'dreditor');
      }
    }
    if (window.console) {
      window.console.log('Installed Dreditor version: ' + installedVersion);
      window.console.log('Latest Dreditor version: ' + latestVersion);
    }
  });
};

Drupal.behaviors.dreditorCommentNumber = {
  attach: function (context) {
    $(context).find('#project-issue-ajax-form h2:first')
      .append(' <strong>#' + Drupal.dreditor.issue.getNewCommentNumber() + '</strong>');
  }
};

Drupal.behaviors.dreditorFormBackup = {
  attach: function (context) {
    var self = this;
    // Skip HTTP GET forms and exclude all search forms (some are using POST).
    $(context).find('form:not([method~="GET"]):not([id*="search"])').once('dreditor-form-backup', function () {
      var $form = $(this);
      var form_id = $form.find('[name="form_id"]').val();

      // Back up the current input whenever the form is submitted.
      $form.bind('submit.dreditor.formBackup', function () {
        Drupal.storage.save('form.backup.' + form_id, $form.find('input:not([type="password"]), textarea, select').serialize());
      });

      // Determine whether there is input that can be restored.
      var lastValues = Drupal.storage.load('form.backup.' + form_id);
      if (!lastValues) {
        return;
      }
      var $button = $('<a href="#" class="dreditor-application-toggle">Restore last input</a>');
      $button.bind('click', function (e) {
        e.preventDefault();
        if (window.confirm('Reset this form to your last submitted values?')) {
          self.restore($form, Drupal.storage.unserialize(lastValues));
          // Remove the button.
          $(this).fadeOut();
        }
      });
      $button.appendTo($form.find('.form-actions:last'));
    });
  },
  restore: function ($form, values) {
    $form.find('[name]').not('[type=hidden]').each(function () {
      if (typeof values[this.name] !== 'undefined') {
        $(this).val(values[this.name]);
      }
    });
  }
};

Drupal.behaviors.dreditorFormSticky = {
  attach: function (context) {
    var self = this;
    // Comment body textarea form item.
    $(context).find('#edit-nodechanges-comment .form-type-textarea').once('dreditor-form-sticky', function () {
      self.addButton($(this).find('.form-textarea-wrapper'));
    });
    // Issue summary body form item.
    // Use the entire form item for the issue summary, so as to include the
    // issue summary template button.
    $(context).find('#project-issue-node-form .form-item-body-und-0-value').once('dreditor-form-sticky', function () {
      self.addButton($(this));
    });
  },

  addButton: function ($wrapper) {
    if ($wrapper.attr('id')) {
      return;
    }
    var $toggle = $('<a href="#" class="dreditor-application-toggle">Make sticky</a>');
    $toggle.bind('click', function (e) {
      e.preventDefault();
      if ($wrapper.attr('id') === 'dreditor-widget') {
        $wrapper.removeAttr('id');
        $toggle.removeClass('sticky-cancel active').text('Make sticky');
      }
      else if (!$wrapper.attr('id') && !$('#dreditor-widget').length) {
        $wrapper.attr('id', 'dreditor-widget');
        $toggle.addClass('sticky-cancel active').text('Unstick');
      }
    });
    $wrapper.prepend($toggle);
  }
};

Drupal.behaviors.dreditorInlineImage = {
  attach: function (context) {
    var $context = $(context);

    // Collect all the textareas we can put HTML into.
    var $textareas = $('textarea.text-full');

    // Keep track of last textarea in focus.
    var $target = $textareas.last();
    $textareas.bind('focus', function () {
      $target = $(this);
    });

    // @todo .file clashes with patchReviewer tr.file + a.file markup.
    $context.find('span.file').once('dreditor-inlineimage').find('> a').each(function () {
      var $link = $(this);

      // Remove protocol + drupal.org
      var url = $link.attr('href').replace(/^https\:\/\/(?:www\.)?drupal\.org/, '');

      // Only process image attachments.
      if (!url.match(/\.png$|\.jpg$|\.jpeg$|\.gif$/)) {
        return;
      }

      // Generate inline image button (cannot be <a>, other scripts bind links).
      var $button = $('<span class="dreditor-button dreditor-inlineimage">Embed</span>');

      // Append inline image button to attachment.
      $link.parent().prepend($button);

      // Override click event.
      $button
        .bind('click', function (e) {
          if (!$target.length) {
            // Well we tried, guess the page doesn't have the textareas we want.
            return;
          }

          // Focus comment textarea.
          $('html, body').animate({
            scrollTop: $target.offset().top
          }, 300);
          // Insert image tag to URL in comment textarea.
          $target.focus().val($target.val() + "\n<img src=\"" + url + "\" alt=\"\" />\n");
          e.preventDefault();
        });
    });
  }
};

Drupal.behaviors.dreditorIssueClone = {
  attach: function (context) {
    var _window = window;
    var $context = $(context);
    $context.find('body.node-type-project-issue:not(.page-node-edit)').once('dreditor-clone-button', function () {
      $('<li><button id="dreditor-clone-button" class="dreditor-button">Clone issue</button></li>')
        .appendTo($context.find('#tabs ul'))
        .find('button')
        .bind('click.dreditor-clone', function () {
          // Retrieve the current issue's project shortname.
          var project = /[^/]*$/.exec($('.breadcrumb').find('a').attr('href'))[0];

          // Open a new window.
          var w = _window.open('/node/add/project-issue/' + project + '#project-issue-node-form', '_blank');
          // @todo Revisit this once Dreditor no longer depends on d.o's jQuery.
          // $(w).bind('load') does not actually bind to the new window "load"
          // event. This may be on purpose or a bug with the currently used
          // jQuery version on d.o (1.4.4).
          w.addEventListener('load', function () {
            // Retrieve the DOM of the newly created window.
            var $document = $(w.document);
            $document.ready(function () {
              var parentNid = Drupal.dreditor.issue.getNid();
              var $parentForm = $context.find('#project-issue-node-form');
              var $newForm = $document.contents().find('#project-issue-node-form');
              var selector, selectors = [
                '#edit-title',
                '#edit-body-und-0-value',
                '#edit-field-issue-category-und',
                '#edit-field-issue-priority-und',
                '#edit-field-issue-status-und',
                '#edit-field-issue-version-und',
                '#edit-field-issue-component-und',
                '#edit-field-issue-assigned-und',
                '#edit-taxonomy-vocabulary-9-und'
              ];
              for (selector in selectors) {
                $newForm.find(selectors[selector]).val($parentForm.find(selectors[selector]).val());
              }

              // Prepend body with "Follow-up to ..." line.
              var $body = $newForm.find('#edit-body-und-0-value');
              $body.val('Follow-up to [#' + parentNid + ']\n\n' + $body.val());

              // Add originating issue was parent issue relationship.
              $newForm.find('#edit-field-issue-parent-und-0-target-id')
                .val($parentForm.find('#edit-title').val() + ' (' + parentNid + ')');


              // Ensure all fieldsets are expanded.
              $newForm.find('.collapsed').removeClass('collapsed');

              // Focus on the new issue title so users can enter it.
              $newForm.find('#edit-title').focus();
            });
          }, false);
        });
    });
  }
};

Drupal.behaviors.dreditorIssueCount = {
  attach: function (context) {
    $('table.project-issue', context).once('dreditor-issuecount', function () {
      var $table = $(this);
      var countTotal = $table.find('tbody tr').length;
      var countSuffix = ($table.parent().parent().find('.pager').length ? '+' : '');
      var countHidden = 0;

      var $container = $('<div class="dreditor-issuecount"></div>');
      $table.before($container);

      // Add link to toggle this feature.
      var enabled = Drupal.storage.load('issuecount.status');
      $('<a href="#" class="dreditor-application-toggle"></a>')
        .text(enabled ? 'Show all issues' : 'Hide irrelevant issues')
        .click(function () {
          Drupal.storage.save('issuecount.status', !enabled);
          // Reload the current page without refresh from server.
          window.location.href = window.location.href;
          return false;
        })
        .prependTo($container);

      if (enabled) {
        countHidden = $table.find('tr.state-2, tr.state-16').not(':has(.marker)').addClass('dreditor-issue-hidden').hide().length;
      }

      // Output optimized count (minus hidden).
      // Separate calculation required, or otherwise some browsers output NaN.
      var count = countTotal - countHidden;
      $container.append('<span class="dreditor-issuecount-total">Displaying <span class="count">' + count + '</span>' + countSuffix + ' issues.</span>');
      if (!countHidden) {
        return;
      }
      var $counter = $container.find('span.dreditor-issuecount-total span.count');

      // Output 'fixed' count.
      var $issuesFixed = $table.find('tr.state-2.dreditor-issue-hidden');
      if ($issuesFixed.length) {
        $('<a href="#" title="Show" class="dreditor-issuecount-hidden">' + $issuesFixed.length + ' fixed issues.' + '</a>')
          .click(function () {
            $issuesFixed.removeClass('dreditor-issue-hidden').show();
            $counter.text(parseInt($counter.text(), 10) + $issuesFixed.length);
            $(this).remove();
            return false;
          })
          .appendTo($container);
      }

      // Output 'needs more info' count.
      var $issuesInfo = $table.find('tr.state-16.dreditor-issue-hidden');
      if ($issuesInfo.length) {
        $('<a href="#" title="Show" class="dreditor-issuecount-hidden">' + $issuesInfo.length + ' issues need more info.' + '</a>')
          .click(function () {
            $issuesInfo.removeClass('dreditor-issue-hidden').show();
            $counter.text(parseInt($counter.text(), 10) + $issuesInfo.length);
            $(this).remove();
            return false;
          })
          .appendTo($container);
      }
    });
  }
};

Drupal.dreditor.issue = {};
/**
 * Gets the issue node id.
 */
Drupal.dreditor.issue.getNid = function() {
  var href = $('#tabs a:first').attr('href');
  if (href.length) {
    return href.match(/(?:node|comment\/reply)\/(\d+)/)[1];
  }
  return false;
};

/**
 * Returns the next comment number for the current issue.
 */
Drupal.dreditor.issue.getNewCommentNumber = function() {
  // Get comment count.
  var lastCommentNumber = $('.comments div.comment:last .permalink').text().match(/\d+$/);
  return (lastCommentNumber ? parseInt(lastCommentNumber[0], 10) : 0) + 1;
};

/**
 * Gets the issue title.
 */
Drupal.dreditor.issue.getIssueTitle = function() {
  var title = $('#page-subtitle').text() || '';
  return title;
};

/**
 * Gets the project shortname.
 *
 * @return
 *   Return false when using the preview mode since the breadcrumb is not
 *   included in the preview mode.
 */
Drupal.dreditor.issue.getProjectShortName = function() {

  // Retreive project from breadcrumb.
  var project = $('.breadcrumb a:eq(0)').attr('href');

  // @todo The comment preview page does not contain a breadcrumb and also
  //   does not expose the project name anywhere else.
  if (project) {
    // The Drupal (core) project breadcrumb does not contain a project page link.
    if (project === '/project/issues/drupal') {
      project = 'drupal';
    }
    else {
      project = project.substr(9);
    }
  }
  else {
    project = false;
  }

  return project;
};

Drupal.dreditor.issue.getSelectedComponent = function() {
  // Retrieve component from the comment form selected option label.
  var version = $(':input[name*="issue_component"] :selected').text();
  return version;
};

/**
 * Gets the selected version.
 *
 * Variations:
 *   7.x
 *   7.x-dev
 *   7.x-alpha1
 *   7.20
 *   7.x-1.x
 *   7.x-1.12
 *   7.x-1.x
 *   - 8.x issues -
 *   - Any -
 *   All-versions-4.x-dev
 */
Drupal.dreditor.issue.getSelectedVersion = function() {
  // Retrieve version from the comment form selected option label.
  var version = $(':input[name*="issue_version"] :selected').text();
  return version;
};

/**
 * Gets the selected core version.
 *
 * Variations:
 *   7.x
 *   7.20
 */
Drupal.dreditor.issue.getSelectedVersionCore = function() {
  var version = Drupal.dreditor.issue.getSelectedVersion();
  var matches = version.match(/^(\d+\.[x\d]+)/);
  if (matches) {
    return matches[0];
  }
  else {
    return false;
  }
};

/**
 * Gets the selected contrib version.
 *
 * Variations:
 *   1.x
 *   1.2
 */
Drupal.dreditor.issue.getSelectedVersionContrib = function() {
  var version = Drupal.dreditor.issue.getSelectedVersion();
  var matches = version.match(/^\d+\.x-(\d+\.[x\d]+)/);
  if (matches) {
    return matches[1];
  }
  else {
    return false;
  }
};

/**
 * Gets the selected core + contrib version.
 *
 * Variations:
 *   7.x-1.x
 *   7.x-1.2
 */
Drupal.dreditor.issue.getSelectedVersionCoreContrib = function() {
  var version = Drupal.dreditor.issue.getSelectedVersion();
  var matches = version.match(/^(\d+\.x-\d+\.[x\d]+)/);
  if (matches) {
    return matches[0];
  }
  else {
    return false;
  }
};

Drupal.behaviors.dreditorIssueMarkAsRead = {
  attach: function (context) {
    $('table.project-issue', context).once('dreditor-issuemarkasread', function () {
      var throbber = '<div class="ajax-progress ajax-progress-throbber"><div class="throbber">&nbsp;</div></div>';
      $(throbber).appendTo(this).hide();

      // 'a + .marker' accounts for a d.o bug; the HTML markup contains two
      // span.marker elements, the second being nested inside the first.
      var $markers = $(this).find('a + .marker').addClass('clickable');

      var $markAll = $('<a href="#" class="dreditor-application-toggle">Mark all as read</a>')
        .click(function (e) {
          $(this).append(throbber);
          $markers.trigger('click.dreditor-markasread');
          e.preventDefault();
          e.stopPropagation();
        });
      if ($markers.length) {
        $markAll.prependTo($(this).parent());
      }

      $markers.bind('click.dreditor-markasread', function () {
        var $marker = $(this);
        $marker.append(throbber);
        var $link = $marker.prev('a');
        $.ajax({
          // The actual HTML page output is irrelevant, so denote that by using
          // the appropriate HTTP method.
          type: 'HEAD',
          url: $link.attr('href'),
          complete: function () {
            $markers = $markers.not($marker);
            if (!$markers.length) {
              $markAll.remove();
            }
            $marker.remove();
          }
        });
      });
    });
  }
};

Drupal.behaviors.dreditorIssueSummary = {
  attach: function () {
    // Limit to project_issue node view page.
    $('#project-summary-container').once('dreditor-issue-summary', function () {
      // Clone "Edit" link after "Issue summary" title.
      var $edit_wrapper = $('<small class="admin-link"> [ <span></span> ] </small>');
      var $edit_link = $('#tabs a:contains("' + 'Edit' + '")').clone();
      $edit_wrapper.find('span').append($edit_link);
      $edit_wrapper.appendTo($(this).parent().find('h2:first'));

      var $widget = $('<div id="dreditor-widget"></div>').insertAfter(this).hide();

      $edit_link.click(function () {
        // First of all, remove this link.
        $edit_wrapper.remove();
        // Retrieve the node edit form.
        $.get(this.href, function (data) {
          var $data = $(data);
          // Do power users really need this advise? Investigate this.
          // $widget.append($data.find('div.help'));
          $widget.append($data.find('#node-form'));

          // For users with just one input format, wrap filter tips in a fieldset.
          // @todo Abstract this into a behavior. Also applies to comment form.
          $widget.find('fieldset > ul.tips')
            .wrap('<fieldset class="collapsible collapsed"></fieldset>')
            .before('<legend>Input format</legend>');
          // Clean up.
          // Remove messages; contains needless info.
          $widget.find('div.messages.status').remove();
          // That info about issue fields in .standard .standard thingy, too.
          $widget.find('div.node-form > div.standard > div.standard').remove();
          // Hide node admin fieldsets; removing these would result in nodes being
          // unpublished and author being changed to Anonymous on submit.
          $widget.find('div.admin').hide();

          // Flatten issue summary, input format, and revision info fielsets.
          // Blatantly remove all other fieldsets. :)
          $widget.find('fieldset')
            .not(':has(#edit-body, .tips, #edit-log)')
            .removeClass('collapsible').hide();
          // Visually remove top-level fieldsets, except text format.
          $widget.find('fieldset:has(#edit-body, #edit-log)')
            .removeClass('collapsible').addClass('fieldset-flat');
          // Remove needless spacing between summary and revision elements.
          $widget.find('.fieldset-flat:eq(0)').css('marginBottom', 0);

          // Hide revision checkbox (only visible for admins, can't be disabled)
          // and revision log message description.
          $widget.find('#edit-revision-wrapper, #edit-log-wrapper .description').hide();
          // Convert revision log message textarea into textfield and prepopulate it.
          var $textarea = $widget.find('#edit-log');
          var $textfield = $('<input type="text" size="60" style="width: 95%;" />');
          $.each($textarea[0].attributes, function (index, attr) {
            $textfield.attr(attr.name, attr.value);
          });
          // Enforced log message doesn't really make sense for power users.
          // We're not crafting an encyclopedia with issues.
          $textfield.val('Updated issue summary.');
          $textarea.replaceWith($textfield);

          // Remove "Preview changes" and "Delete" buttons.
          $widget.find('#edit-preview-changes').remove();
          $widget.find('#edit-delete').remove();
          // Sorry, no support for "Preview" yet.
          $widget.find('#edit-preview').remove();

          // Add a Cancel button. Move it far away from the submit button. ;)
          $widget.find('#edit-submit').before(
            $('<a href="javascript:void(0);" class="dreditor-button right">Cancel</a>').click(function () {
              $widget.slideUp('fast', function () {
                $widget.remove();
              });
              return false;
            })
          );

          // Lastly, attach behaviors and slide in.
          Drupal.attachBehaviors($widget.get(0));
          $widget.slideDown();
        }, 'html');
        return false;
      });
    });
  }
};

Drupal.behaviors.dreditorIssueSummaryTemplate = {
  attach: function () {
    var self = this;
    $('body.logged-in.page-node form.node-project_issue-form textarea[name="body[und][0][value]"]').once('dreditorIssueTemplate', function () {
      var $textarea = $(this);
      var $label = $('label[for*="edit-body-und-0-value"]');

      // Add a link to issue summary instructions.
      $('<small><a href="/issue-summaries" target="_blank" class="admin-link">instructions</a></small>')
        .appendTo($label);

      // Add a button to insert issue summary template.
      $('<a href="#" class="dreditor-button" style="margin-left: 10px;">Insert template</a>')
        .appendTo($label)
        .bind('click', function (e) {
          e.preventDefault();
          self.insertSummaryTemplate($textarea);
        });

      // Add a button to insert tasks.
      $('<a href="#" class="dreditor-button" style="margin-left: 10px;">Insert tasks</a>')
        .appendTo($label)
        .bind('click', function (e) {
          e.preventDefault();
          self.insertTasks($textarea);
        });
    });
  },
  insertSummaryTemplate: function ($textarea) {
    $.get('/node/3156940', function (data) {
      // Retrieve the template.
      var $template = $('<div/>').html($(data).find('#summary-template code').text());

      // On node/add, remove the "Original report by" section.
      if (location.href.search('node/add') !== -1) {
        $template.find('#summary-original-report').remove();
      }
      // On node view, simply replace @username with the existing link to the
      // original author.
      else if (!location.href.match(/^.*node\/[^\/]*\/edit/)) {
        var $profileLink = $('.node .submitted a.username').clone();
        if ($profileLink.length) {
          $profileLink.text('@' + $profileLink.text());
        }
        else {
          $profileLink = $('<a/>').text('Anonymous').attr('href', '#');
        }
        $template.find('#summary-original-report a').replaceWith($('<div/>').html($profileLink).html());
      }
      // On node edit, the node author is only visible for privileged users.
      // Retrieve the author from the issue's JSON data.
      // @todo Update when JSON data is available, or find a better solution.
//      else {
//        var nodePath = location.href.match(/^.*node\/[0-9]*/);
//        if (nodePath) {
//          $.getJSON(nodePath[0] + '/project-issue/json', function (json) {
//            var $profileLink;
//            var $bodyVal = $('<div/>').html($textarea.val());
//            if (!json.authorId || !json.authorName || !json.authorUrl) {
//              $profileLink = $('<a/>').text('Anonymous').attr('href', '#');
//            }
//            else {
//              $profileLink = $('<a/>').text('@' + json.authorName).attr('href', json.authorUrl);
//            }
//            $bodyVal.find('#summary-original-report a').replaceWith($('<div/>').html($profileLink).html());
//            $textarea.val($bodyVal.html());
//          });
//        }
//      }

      var template = $template.html()
        .replace(/<\/em>/g, "</em>\n\n")
        .replace(/<\/h3>/g, "</h3>\n\n");

      // Prepend template to current body.
      $textarea.val(template + $textarea.val());
    });
  },
  insertTasks: function ($textarea) {
    $.get('/node/3156943', function (data) {
      // Retrieve the template.
      var $template = $('<div/>').html($(data).find('code').text());

      // Add missing newlines.
      var template = $template.html()
        .replace(/-->/g, "-->\n\n");

      // Insert the template at the cursor if possible.
      var pos = $textarea[0].selectionStart;
      var bodyValue = $textarea.val();
      $textarea.val(bodyValue.substring(0, pos) + template + bodyValue.substring(pos));
    });
  }
};

Drupal.behaviors.dreditorIssuesFilterFormValuesClean = {
  attach: function (context) {
    $('.view-filters form', context).once('dreditor-issues-form-values-clean', function () {
      $(this).submit(function (event) {
        $.each(event.target.elements, function (index, element) {
          var $element = $(element);
          var value = $element.val();
          switch (element.name) {
            case 'text':
            case 'assigned':
            case 'submitted':
            case 'participant':
            case 'issue_tags':
              if (value === '') {
                element.disabled = true;
              }
              break;

            case 'status':
              if (value === 'Open') {
                element.disabled = true;
              }
              break;

            case 'priorities':
            case 'categories':
            case 'version':
            case 'component':
              if (value === 'All') {
                element.disabled = true;
              }
              break;

            case 'issue_tags_op':
              if (value === 'or') {
                element.disabled = true;
              }
              break;
          }
        });
      });
    });
  }
};

/**
 * Add a 'Reset' button to project issue exposed views filter form.
 */
Drupal.behaviors.dreditorIssuesFilterFormReset = {
  attach: function (context) {
    if (!window.location.search) {
      return;
    }
    $('.view-filters form', context).once('dreditor-issues-form-reset', function () {
      var $form = $(this);
      var $container = $form.find('input.form-submit').parent();
      var $button = $container.clone().find('input').val('Reset').click(function () {
        // Reload the current page without query string and without refresh.
        Drupal.dreditor.redirect(null, { query: '' });
        return false;
      }).end();
      $container.after($button);
    });
  }
};

Drupal.behaviors.dreditorPatchNameSuggestion = {
  attach: function (context) {
    // Attach this behavior only to project_issue nodes. Use a fast selector for
    // the common case, but also support comment/reply/% pages.
    if (!($('body.node-type-project-issue', context).length || $('div.project-issue', context).length)) {
      return;
    }

    $('#project-issue-ajax-form .field-name-field-issue-files .form-type-managed-file', context).once('dreditor-patchsuggestion', function () {
      var $container = $('> label', this);
      var $link = $('<a class="dreditor-application-toggle dreditor-patchsuggestion" href="#">Patchname suggestion</a>');
      $link.prependTo($container);
      $link.click(function() {
        var patchName = '';

        function truncateString (str, n,useWordBoundary){
          var toLong = str.length>n,
          s_ = toLong ? str.substr(0,n-1) : str;
          return useWordBoundary && toLong ? s_.substr(0,s_.lastIndexOf(' ')) : s_;
        }

        var title = truncateString(Drupal.dreditor.issue.getIssueTitle() || '', 25, true);

        // Truncate and remove a heading/trailing underscore.
        patchName += title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/(^_|_$)/, '').toLowerCase();

        var nid = Drupal.dreditor.issue.getNid() || 0;
        if (nid !== 0) {
          patchName += (patchName.length ? '-' : '') + nid;
        }
        patchName += '-' + Drupal.dreditor.issue.getNewCommentNumber();
        patchName += '.patch';

        window.prompt("Please use this value", patchName);
        return false;
      });
    });
  }
};

Drupal.behaviors.dreditorPatchReview = {
  attach: function (context) {
    var $context = $(context);
    // Prevent users from starting to review patches when not logged in.
    if (!$context.find('#project-issue-ajax-form').length) {
      return;
    }
    var $elements = $context.find('.file').once('dreditor-patchreview').find('> a');
    $elements.each(function () {
      if (this.href.match(/\.(patch|diff|txt)$/)) {
        // Generate review link.
        var $file = $(this).closest('tr').find('.file');
        var $link = $('<a class="dreditor-button dreditor-patchreview" href="' + this.href + '">Review</a>').click(function (e) {
          if (Drupal.dreditor.link !== this && Drupal.dreditor.$wrapper) {
            Drupal.dreditor.tearDown(false);
          }
          if (Drupal.dreditor.link === this && Drupal.dreditor.$wrapper) {
            Drupal.dreditor.show();
          }
          else {
            Drupal.dreditor.link = this;
            // Load file.
            $.get(this.href, function (content, status) {
              if (status === 'success') {
                // Invoke Dreditor.
                Drupal.dreditor.setup(context, 'patchReview', content);
              }
            });
          }
          e.preventDefault();
        });
        // Append review link to parent table cell.
        $link.prependTo($file);

        // Generate simplytest.me links only for patches and diffs.
        if (this.href.substr(-6) === '.patch' || this.href.substr(-5) === '.diff') {
          // Retrieve project shortname.
          var project = Drupal.dreditor.issue.getProjectShortName();
          if (project) {
            var version = Drupal.dreditor.issue.getSelectedVersion().replace('-dev', '');
            if (version) {
              $('<a/>').text('simplytest.me').attr({
                class: 'dreditor-button dreditor-patchtest',
                href: 'http://simplytest.me/project/' + project + '/' + version + '?patch[]=' + this.href,
                target: '_blank'
              }).prependTo($file);
            }
          }
        }
      }
    });
  }
};
/**
 * Dreditor patchReview application.
 *
 * This is two-fold:
 * - Drupal.dreditor.patchReview: Handles selections and storage/retrieval of
 *   temporary comment data.
 * - Drupal.dreditor.patchReview.comment: An API to load/save/delete permanent
 *   comments being attached to code lines.
 */
Drupal.dreditor.patchReview = {
  /**
   * patchReview behaviors stack.
   */
  behaviors: {},

  /**
   * Current selection jQuery DOM element stack.
   */
  data: {
    elements: []
  },

  reset: function () {
    // Reset currently stored selection data.
    $(this.data.elements).removeClass('selected');
    this.data = { elements: [] };
    // Remove and delete pastie form.
    if (this.$form) {
      this.$form.remove();
      delete this.$form;
    }
  },

  /**
   * Load data into selection storage.
   */
  load: function (data) {
    // Do not overwrite other comment data; also works for the undefined case.
    if (this.data.id !== data.id) {
      this.reset();
    }
    this.data = data;
  },

  /**
   * Add elements to current selection storage.
   *
   * $.unique() invoked via $.add() fails to apply and identify an existing
   * DOM element id (which is internally done via $.data()). Additionally, ===
   * in $.inArray() fails to identify DOM elements coming from .getSelection(),
   * which are already in our stack. Hence, we need custom code to merge DOM
   * elements of a new selection into our stack.
   *
   * After merging, all elements in the stack are re-ordered by their actual
   * DOM position.
   */
  add: function (elements) {
    if (!elements.length) {
      return elements;
    }
    // Merge new elements.
    var self = this;
    $.each(elements, function () {
      var newelement = this, merge = true;
      // Check whether this element is already in the stack.
      $.each(self.data.elements, function () {
        if (this === newelement) {
          merge = false;
          return;
        }
      });
      if (merge) {
        self.data.elements.push(newelement);
      }
    });
    // Re-order elements by their actual DOM position.
    self.data.elements.sort(sortOrder);
    return elements;
  },

  remove: function (elements) {
    if (!elements.length) {
      return elements;
    }
    var self = this;
    $(elements).removeClass('selected');
    $.each(elements, function () {
      var element = this;
      var newlist = [];
      $.each(self.data.elements, function () {
        if (this !== element) {
          newlist.push(this);
        }
      });
      self.data.elements = newlist;
    });
  },

  edit: function () {
    var self = this;
    // Mark current selection/commented code as selected.
    $(self.data.elements).addClass('selected');

    // Add Pastie.
    if (!self.$form) {
      self.$form = Drupal.dreditor.form.create('pastie');
      // Add comment textarea.
      self.$form.append('<h3>Comment selected code:</h3>');
      self.$form.append('<textarea name="comment" class="form-textarea resizable" rows="10"></textarea>');
      // Add comment save button.
      self.$form.addButton((self.data.id !== undefined ? 'Update' : 'Save'), function () {
        // @todo For any reason, FF 3.5 breaks when trying to access
        //   form.comment.value. Works in FF 3.0.x. WTF?
        var value = this.find('textarea').val();
        // Store new comment, if non-empty.
        if ($.trim(value).length) {
          self.comment.save({
            id: self.data.id,
            elements: self.data.elements,
            comment: value
          });
        }
        $.each(self.data.elements, function () {
          $(this).attr('title', value);
        });
        // Reset pastie.
        self.reset();
      });
      // Add comment cancel button.
      self.$form.addButton('Cancel', function () {
        // Reset pastie.
        self.reset();
      });
      // Add comment delete button for existing comments.
      if (self.data.id !== undefined) {
        self.$form.addButton('Delete', function () {
          self.comment.remove(self.data.id);
          // Reset pastie.
          self.reset();
        });
      }
      // Append pastie to sidebar, insert current comment and focus it.
      self.$form.appendTo('#bar').find('textarea').val(self.data.comment || '');
      Drupal.dreditor.attachBehaviors();
      // Focus pastie; only for initial comment selection to still allow for
      // copying of file contents.
      self.$form.find('textarea').focus();
    }
  },

  /**
   * Wrapper around jQuery's sortOrder() to sort review comments.
   */
  sort: function (a, b) {
    if (!a || !b) {
      return 0;
    }
    return sortOrder(a.elements[0], b.elements[0]);
  },

  paste: function () {
    var html = '';
    var comments = [];
    this.comment.comments.sort(this.sort);
    $.each(this.comment.comments, function (index, comment) {
      // Skip deleted (undefined) comments; this would return window here.
      if (!comment) {
        return true;
      }
      var $elements = $(this.elements);
      // Skip comments with no corresponding lines.
      var firstLine = $elements.get(0);
      if (!firstLine) {
        return true;
      }
      var markup = '<code>\n';
      // Add file information.
      var lastfile = $elements.eq(0).prevAll('tr.file:has(a.file)').get(0);
      if (lastfile) {
        markup += lastfile.textContent + '\n';
      }
      // Add hunk information.
      var lasthunk = $elements.eq(0).prevAll('tr.file').get(0);
      if (lasthunk) {
        markup += lasthunk.textContent + '\n';
      }

      var lastline = firstLine.previousSibling;
      var lastfileNewlineAdded;

      $elements.each(function () {
        var $element = $(this);
        lastfileNewlineAdded = false;
        // Add new last file, in case a comment spans over multiple files.
        if (lastfile && lastfile !== $element.prevAll('tr.file:has(a.file)').get(0)) {
          lastfile = $element.prevAll('tr.file:has(a.file)').get(0);
          if (lastfile) {
            markup += '\n' + lastfile.textContent + '\n';
            lastfileNewlineAdded = true;
          }
        }
        // Add new last hunk, in case a comment spans over multiple hunks.
        if (lasthunk && lasthunk !== $element.prevAll('tr.file').get(0)) {
          lasthunk = $element.prevAll('tr.file').get(0);
          if (lasthunk) {
            // Only add a newline if there was no new file already.
            if (!lastfileNewlineAdded) {
              markup += '\n';
              lastfileNewlineAdded = true;
            }
            markup += lasthunk.textContent + '\n';
          }
        }
        // Add a delimiter, in case a comment spans over multiple selections.
        else if (lastline && lastline !== $element.get(0).previousSibling) {
          markup += '...\n';
        }
        markup += $element.find('.pre').text() + '\n';

        // Use this line as previous line for next line.
        lastline = $element.get(0);
      });

      markup += '</code>\n';
      markup += '\n' + this.comment;
      comments.push(markup);
    });
    if (comments.length === 1) {
      html += comments.join('');
    }
    // If there's more than one comment, wrap them in ordered list markup.
    else if (comments.length > 1) {
      html += '<ol>\n\n';
      for (var i = 0; i < comments.length; i++) {
        html += '<li>\n' + comments[i] + '\n</li>\n\n';
      }
      html += '</ol>';
    }

    // Paste comment into issue comment textarea.
    var $commentField = $('#project-issue-ajax-form :input[name*="comment_body"]');
    $commentField.val($commentField.val() + html);
    // Flush posted comments.
    this.comment.comments = [];
    // Change the status to 'needs work'.
    // @todo Prevent unintended/inappropriate status changes.
    //$('#edit-sid').val(13);
    // Jump to the issue comment textarea after pasting.
    Drupal.dreditor.goto('#project-issue-ajax-form');
    // Close Dreditor.
    Drupal.dreditor.tearDown();
  }
};
Drupal.dreditor.patchReview.comment = {
  /**
   * Review comments storage.
   */
  comments: [],

  /**
   * Create or update a comment.
   *
   * If data already contains an id, the existing comment is updated.
   *
   * @return
   *   The stored data, including new id for new comments.
   */
  save: function (data) {
    if (data.id !== undefined) {
      this.comments[data.id] = data;
    }
    else {
      this.comments.push(data);
      // Return value of .push() is not suitable for real ids.
      var newid = this.comments.length - 1;
      this.comments[newid].id = data.id = newid;
    }
    // Mark new comments, if there are any.
    $(this.comments[data.id].elements).addClass('new-comment');
    $(this.comments[data.id].elements).addClass('comment-id-' + data.id).addClass('has-comment');

    Drupal.dreditor.attachBehaviors();
    return data;
  },

  load: function (id) {
    var data;
    if (typeof id !== undefined && typeof this.comments[id] === 'object') {
      data = this.comments[id];
    }
    return data || {};
  },

  /**
   * Deletes a comment by ID.
   *
   * Called 'remove', since 'delete' is a reserved keyword.
   */
  remove: function (id) {
    var data = this.load(id);
    if (data && data.id !== undefined) {
      $(data.elements)
        .removeClass('has-comment')
        .removeClass('comment-id-' + id)
        .removeAttr('title')
        // @todo For whatever reason, the click event is not unbound here.
        .unbind('click.patchReview.editComment');
      delete this.comments[id];
    }
    return data || {};
  }
};
Drupal.dreditor.patchReview.overlay = {
  element: null,
  data: {},

  setup: function () {
    this.element = $('<div id="dreditor-overlay"></div>').hide().appendTo('#dreditor #bar');
    return this;
  },

  load: function (data) {
    // Setup overlay if required.
    if (!this.element) {
      this.setup();
    }
    if (data !== undefined && typeof data.comment === 'string') {
      this.data = data;
      this.element.empty();
      // Do some basic text2html processing.
      var content = data.comment.replace(/\n$[^<]/gm, '<br />\n');
      // @todo jQuery seems to suck up newlines in child nodes (such as <code>).
      this.element.append('<p>' + content + '</p>');
    }
  },

  show: function () {
    this.element.show();
    return this;
  },

  hide: function () {
    this.element.hide();
    return this;
  }
};
/**
 * Create diff outline and highlighting from plaintext code.
 *
 * We parse all lines of the file into separate DOM elements to be able to
 * attach data (e.g. comments) to selected lines and generate a "jump menu"
 * for files and hunks.
 *
 * @param context
 *   The context to work on.
 * @param code
 *   Plain-text code to parse.
 *
 * @todo Move setup and storage of pastie elsewhere?
 */
Drupal.dreditor.patchReview.behaviors.setup = function (context, code) {
  // Ensure this is only executed once.
  if ($('#code', context).length || !code) {
    return;
  }

  // Reset pastie; may have been active when user clicked global 'Cancel' button.
  // @todo This cries for a proper hook system.
  Drupal.dreditor.patchReview.reset();

  // Convert CRLF, CR into LF.
  code = code.replace(/\r\n|\r/g, "\n");
  // Escape HTML tags and entities; order of replacements is important.
  code = code.replace(/&/g, '&amp;');
  code = code.replace(/</g, '&lt;');
  code = code.replace(/>/g, '&gt;');
  // Remove cruft: IDE comments and unversioned files.
  code = code.replace(/^\# .+\n|^\? .+\n/mg, '');

  // Setup code container.
  var $code = $('<table id="code"></table>');
  $code.append('<thead><tr><th class="line-ruler" colspan="3"></th></tr></thead>');
  var $menu = $('#menu', context);
  var $lastFile = $('<li>Parse error</li>');

  $('<h3>Diff statistics</h3>').appendTo('#dreditor #bar');
  var $diffstat = $('<div id="diffstat"></div>').appendTo('#dreditor #bar');
  var diffstat = { files: 0, insertions: 0, deletions: 0 };

  code = code.split('\n');
  var ln1 = '';
  var ln2 = '';
  var ln1content = '';
  var ln2content = '';
  var maxln1 = 0;
  var maxln2 = 0;
  for (var n in code) {
    var ln1o = true;
    var ln2o = true;
    var line = code[n];

    // Build file menu links.
    line = line.replace(/^(\+\+\+ )([^\s]+)(\s.*)?/, function (full, match1, match2, match3) {
      var id = match2.replace(/[^A-Za-z_-]/g, '');
      $lastFile = $('<li><a href="#' + id + '">' + match2 + '</a></li>');
      $menu.append($lastFile);
      diffstat.files++;
      return match1 + '<a class="file" id="' + id + '">' + match2 + '</a>' + (match3 ? match3 : '');
    }); // jshint ignore:line
    // Build hunk menu links for file.
    line = line.replace(/^(@@ .+ @@\s+)([^\s]+\s[^\s\(]*)/, function (full, match1, match2) {
      var id = match2.replace(/[^A-Za-z_-]/g, '');
      $lastFile.append('<li><a href="#' + id + '">' + match2 + '</a></li>');
      return match1 + '<a class="hunk" id="' + id + '">' + match2 + '</a>';
    }); // jshint ignore:line

    // parse hunk line numbers
    var line_numbers = line.match(/^@@ -([0-9]+),[0-9]+ \+([0-9]+),[0-9]+ @@/);
    if (line_numbers) {
      ln1 = line_numbers[1];
      ln2 = line_numbers[2];
    }

    var classes = [], syntax = false;
    // Colorize file diff lines.
    if (line.match(/^((index|===|RCS|new file mode|deleted file mode|similarity|rename|copy|retrieving|diff|\-\-\-\s|\-\-\s|\+\+\+\s|@@\s).*)$/i)) {
      classes.push('file');
      ln1o = false;
      ln2o = false;
      // Renames and copies are easy to miss; colorize them.
      if (line.match(/^rename from|^copy from|^deleted file/)) {
        classes.push('old');
      }
      else if (line.match(/^rename to|^copy to/)) {
        classes.push('new');
      }
    }
    // Colorize old code, but skip file diff lines.
    else if (line.match(/^((?!\-\-\-$|\-\-$)\-.*)$/)) {
      classes.push('old');
      diffstat.deletions++;
      syntax = true;
      if (ln1) {
        ln2o = false;
        ln1++;
      }
    }
    // Colorize new code, but skip file diff lines.
    else if (line.match(/^((?!\+\+\+)\+.*)$/)) {
      // Expose tabs.
      line = line.replace(/(\t+)/, '<span class="error tab">$1</span>');
      // Wrap trailing white-space with a SPAN to expose them during patch
      // review. Also add a hidden end-of-line character that will only appear
      // in the pasted code.
      line = line.replace(/^(.*\S)(\s+)$/, '$1<span class="error whitespace">$2</span><span class="hidden">¶</span>');

      classes.push('new');
      diffstat.insertions++;
      syntax = true;
      if (ln2) {
        ln1o = false;
        ln2++;
      }
    }
    // Replace line with a space (so ruler shows up).
    else if (!line.length) {
      line = '&nbsp;';
    }
    // Match git format-patch EOF lines and reset line count.
    else if (line.match(/^\-\-$/)) {
      ln1o = false;
      ln2o = false;
      ln1 = '';
      ln2 = '';
    }
    // Detect missing newline at end of file.
    else if (line.match(/.*No newline at end of file.*/i)) {
      line = '<span class="error eof">' + line + '</span>';
    }
    else {
      if (ln1 && ln1o) {
        ln1++;
      }
      if (ln2 && ln2o) {
        ln2++;
      }
    }
    // Colorize comments.
    if (syntax && line.match(/^.\s*\/\/|^.\s*\/\*[\* ]|^.\s+\*|^.\s*#/)) {
      classes.push('comment');
    }

    // Wrap all lines in PREs for copy/pasting and add the 80 character ruler.
    ln1content = (ln1o ? ln1 : '');
    ln2content = (ln2o ? ln2 : '');
    classes = (classes.length ? ' class="' + classes.join(' ') + '"' : '');
    line = '<tr' + classes + '><td class="ln" data-line-number="' + ln1content + '"></td><td class="ln" data-line-number="' + ln2content + '"></td><td><span class="pre">' + line + '</span></td></tr>';

    // Calculate the largest line numbers in the gutter, used
    // for determining the position of the 80 character ruler.
    if (ln1content > maxln1) {
      maxln1 = ln1content;
    }
    if (ln2content > maxln2) {
      maxln2 = ln2content;
    }

    // Append line to parsed code.
    $code.append(line);
  }

  // The line ruler must be displayed consistently across all browsers and OS
  // that may or may not have the same fonts (kerning). Calculate the width of
  // 81 "0" characters (80 character line plus the +/- prefix from the diff)
  // by using an array (82 items joined by "0").
  //
  // We also calculate the width of the gutter (line numbers) by using the
  // largest combination of line numbers calculated above.
  var $lineRuler = $('<table id="code"><thead><tr><th class="line-ruler" colspan="3"></th></tr></thead><tbody><tr><td class="ln ln-1" data-line-number="' + maxln1 + '"></td><td class="ln ln-2" data-line-number="' + maxln2 + '"></td><td><span class="pre">' + new Array(82).join('0') + '</span></td></tr></tbody></table>')
    .appendTo('#dreditor');
  var ln1gutter = $lineRuler.find('.ln-1').outerWidth();
  var ln2gutter = $lineRuler.find('.ln-2').outerWidth();
  var lineWidth = $lineRuler.find('.pre').width();
  // Add 10px for padding (the td that contains span.pre).
  var lineRulerOffset = ln1gutter + ln2gutter + lineWidth + 10;
  var lineRulerStyle = {};
  // Check for a reasonable value for the ruler offset.
  if (lineRulerOffset > 100) {
    lineRulerStyle = {
      'visibility': 'visible',
      'left': lineRulerOffset + 'px'
    };
  }
  $lineRuler.remove();

  // Append to body...
  $('#dreditor-content', context)
    // the parsed code.
    .append($code);

  // Set the position of the 80-character ruler.
  $('thead .line-ruler').css(lineRulerStyle);

  // Append diffstat to sidebar.
  $diffstat.html(diffstat.files + '&nbsp;files changed, ' + diffstat.insertions + '&nbsp;insertions, ' + diffstat.deletions + '&nbsp;deletions.');

  var start_row;
  $('tr', $code).mousedown(function(){
    start_row = $(this)[0];
  });

  // Colorize rows during selection.
  $('tr', $code).mouseover(function(){
    if (start_row) {
      var end_row = $(this)[0];
      var start = false;
      var end = false;
      var selection = [];
      selection.push(start_row);
      $('tr', $code).each(function(){
        if ($(this)[0] === start_row) {
          start = true;
        }
        if (start && !end) {
          selection.push($(this)[0]);
        }
        if ($(this)[0] === end_row) {
          end = true;
        }
      });
      // Refresh selection.
      $('.pre-selected').removeClass('pre-selected');
      $.each(selection, function () {
        $(this).addClass('pre-selected');
      });
    }
  });

  // Finalize selection.
  $('tr', $code).mouseup(function(){
    if (start_row) {
      var end_row = $(this)[0];
      var start = false;
      var end = false;
      var selection = [];
      selection.push(start_row);
      $('tr', $code).each(function(){
        if ($(this)[0] === start_row) {
          start = true;
        }
        if (start && !end) {
          selection.push($(this)[0]);
        }
        if ($(this)[0] === end_row) {
          end = true;
        }
      });

      // If at least one element in selection is not yet selected, we need to select all. Otherwise, deselect all.
      var deselect = true;
      $.each(selection, function () {
        if (!$(this).is('.selected')) {
          deselect = false;
        }
      });
      $('.pre-selected').removeClass('pre-selected');
      if (deselect) {
        Drupal.dreditor.patchReview.remove(selection);
      }
      else {
        Drupal.dreditor.patchReview.add(selection);
        // Display pastie.
        Drupal.dreditor.patchReview.edit();
      }
    }
    start_row = false;
  });
};
/**
 * Attach click handler to jump menu.
 */
Drupal.dreditor.patchReview.behaviors.jumpMenu = function (context) {
  $('#menu a', context).once('dreditor-jumpmenu', function () {
    $(this).click(function () {
      Drupal.dreditor.goto(this.hash);
      return false;
    });
  });
};
Drupal.dreditor.patchReview.behaviors.attachPastie = function (context) {
  // @todo Seems we need detaching behaviors, but only for certain DOM elements,
  //   wrapped in a jQuery object to eliminate the naive 'new-comment' handling.
  $('#code .has-comment.new-comment', context).removeClass('new-comment')
    .unbind('click.patchReview.editComment').bind('click.patchReview.editComment', function () {
      // Load data from from element attributes.
      var params = Drupal.dreditor.getParams(this, 'comment');
      if (params.id !== undefined) {
        // Load comment and put data into selection storage.
        var data = Drupal.dreditor.patchReview.comment.load(params.id);
        Drupal.dreditor.patchReview.load(data);
        // Display pastie.
        Drupal.dreditor.patchReview.edit();
      }
      return false;
    })
    // Display existing comment on hover.
    .hover(
    function () {
      // Load data from from element attributes.
      var params = Drupal.dreditor.getParams(this, 'comment');
      // Load comment and put data into selection storage.
      if (params.id !== undefined) {
        var data = Drupal.dreditor.patchReview.comment.load(params.id);
        Drupal.dreditor.patchReview.overlay.load(data);
        // Display overlay.
        Drupal.dreditor.patchReview.overlay.show();
      }
    },
    function () {
      Drupal.dreditor.patchReview.overlay.hide();
    }
  );
};
Drupal.dreditor.patchReview.behaviors.saveButton = function (context) {
  if (!$('#dreditor-actions #dreditor-save', context).length) {
    // @todo Convert global Dreditor buttons into a Dreditor form.
    var $save = $('<input id="dreditor-save" class="dreditor-button" type="button" value="Paste" />');
    $save.click(function () {
      Drupal.dreditor.patchReview.paste();
      return false;
    });
    $save.prependTo('#dreditor-actions');
  }
};
/**
 * Add link to toggle display of deleted patch lines.
 */
Drupal.dreditor.patchReview.behaviors.toggleDeletions = function (context) {
  $('#dreditor #bar').once('toggle-deletions', function () {
    var $link = $('<a href="#" class="dreditor-application-toggle">Hide deletions</a>');
    $link.toggle(
      function () {
        $('#code tr.old', context).addClass('element-invisible');
        $link.text('Show deletions');
        this.blur();
        return false;
      },
      function () {
        $('#code tr.old', context).removeClass('element-invisible');
        $link.text('Hide deletions');
        this.blur();
        return false;
      }
    );
    $(this).append($link);
  });
};

Drupal.behaviors.dreditorPIFT = {
  attach: function (context) {
    var $context = $(context);
    $context.find('.field-name-field-issue-files').attr('id', 'recent-files');
    $context.find('.field-name-field-issue-files table').once('dreditor-pift', function () {
      var $table = $(this);
      $table.find('th[name*="size"], th[name*="uid"]').remove();
      var comments = 0;
      $table.find('tbody tr').each(function() {
        var $row = $(this);
        // File row.
        if ($row.is('.extended-file-field-table-row:not(.pift-test-info)')) {
          var $cid = $row.find('.extended-file-field-table-cid');
          var $file = $row.find('.extended-file-field-table-filename .file');
          var $size = $row.find('.extended-file-field-table-filesize');
          var $name = $row.find('.extended-file-field-table-uid');
          var comment = parseInt($cid.text().replace('#', ''), 10) || 0;
          $file.find('a:not(.dreditor-button)').before('<span class="size">' + $size.text() + '</span>');
          $size.remove();
          $cid.append($name.html());
          $name.remove();
          var $parentComment = $table.find('tr[data-comment="' + comment +'"]');
          var zebra = $parentComment.data('zebra');
          if (zebra) {
            $row.removeClass('odd even').addClass(zebra);
          }
          var $prevCid = $parentComment.find('.extended-file-field-table-cid');
          if ($prevCid.length) {
            var rowspan = $cid.attr('rowspan');
            $prevCid.attr('rowspan', ($prevCid.attr('rowspan') + rowspan));
            $cid.remove();
          }
          else {
            comments++;
            zebra = comments % 2 ? 'odd' : 'even';
            $row
              .attr({
                'data-comment': comment,
                'data-zebra': zebra
              })
              .removeClass('odd even')
              .addClass(zebra);
          }
        }
        // PIFT row.
        else if ($row.is('.pift-test-info')) {
          var $cell = $row.find('td');
          $row.prev().find('td:not(.extended-file-field-table-cid)').addClass($cell.attr('class'));
          $cell.find('.pift-operations').prependTo($cell);
        }
      });
    });

    $context.find('.field-name-field-issue-changes table.nodechanges-file-changes').once('dreditor-pift', function() {
      var $table = $(this);
      $table.find('th:last').remove();
      $table.find('tbody tr').each(function() {
        var $row = $(this);
        // PIFT row.
        if ($row.is('.pift-test-info')) {
          var $cell = $row.find('td');
          $row.prev().find('td').addClass($cell.attr('class'));
          $cell.find('.pift-operations').prependTo($cell);
        }
        // File row.
        else {
          var $file = $row.find('.nodechanges-file-link .file');
          var $size = $row.find('.nodechanges-file-size');
          $file.find('a:not(.dreditor-button)').before('<span class="size">' + $size.text() + '</span>');
          $size.remove();
        }
      });
    });
  }
};

Drupal.behaviors.dreditorProjectsCollapse = {
  attach: function (context) {
    var $tables = $(context).find('.view-project-issue-user-projects table');
    if (!$tables.length) {
      return;
    }
    var enabled = Drupal.storage.load('projectscollapse.status');

    // Add link to toggle this feature.
    $('<a href="#" class="dreditor-application-toggle"></a>')
      .text(enabled ? 'Always show projects' : 'Collapse projects')
      .click(function () {
        Drupal.storage.save('projectscollapse.status', !enabled);
        // Reload the current page without refresh from server.
        window.location.href = window.location.href;
        return false;
      })
      .insertBefore($tables.eq(0));

    if (!enabled) {
      return;
    }
    $tables.once('dreditor-projectscollapse', function () {
      var $elements = $(this).children(':not(caption)');
      $(this).css('width', '100%')
        .find('> caption')
        .css({ cursor: 'pointer' })
        .bind('click.projectscollapse', function () {
          // .slideToggle() forgets about table width in d.o's outdated jQuery
          // version.
          $elements.toggle();
        })
        .triggerHandler('click');
    });
  }
};

Drupal.behaviors.dreditorSyntaxAutocomplete = {
  attach: function (context) {
    $('textarea', context).once('dreditor-syntaxautocomplete', function () {
      new Drupal.dreditor.syntaxAutocomplete(this);
    });
  }
};

/**
 * Initializes a new syntax autocompletion object.
 *
 * @param element
 *   A form input element (e.g., textarea) to bind to.
 */
Drupal.dreditor.syntaxAutocomplete = function (element) {
  this.keyCode = 9;
  this.$element = $(element);

  this.$suggestion = $('<span></span>');
  this.$tooltip = $('<div class="dreditor-tooltip">TAB: </div>')
    .hide()
    .insertAfter(this.$element)
    .append(this.$suggestion);

  // Intercept the autocompletion key upon pressing the key. Webkit does not
  // support the keypress event for special keys (such as arrows and TAB) that
  // are reserved for internal browser behavior. Only the keydown event is
  // triggered for all keys.
  // @see http://bugs.jquery.com/ticket/7300
  this.$element.bind('keydown.syntaxAutocomplete', { syntax: this }, this.keypressHandler);
  // After user input has been entered, check for suggestions.
  this.$element.bind('keyup.syntaxAutocomplete', { syntax: this }, this.keyupHandler);
};

/**
 * Responds to keypress events in the bound element to prevent default key event handlers.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.keypressHandler = function (event) {
  var self = event.data.syntax, pos = this.selectionEnd;

  // If the autocompletion key was pressed and there is a suggestion, perform
  // the text replacement.
  // event.which is 0 in the keypress event, so directly compare with keyCode.
  if (event.keyCode === self.keyCode && self.suggestion) {
    // Backup the current scroll position within the textarea. Any manipulation
    // of this.value automatically resets this.scrollTop to zero.
    var scrollTop = this.scrollTop;

    var prefix = this.value.substring(0, pos - self.needle.length);
    var suffix = this.value.substring(pos);
    this.value = prefix + self.suggestion.replace('^', '') + suffix;

    // Move the cursor to the autocomplete position marker.
    var newpos = pos - self.needle.length + self.suggestion.indexOf('^');
    this.setSelectionRange(newpos, newpos);

    // Restore original scroll position.
    this.scrollTop = scrollTop;

    // Remove the tooltip and suggestion directly after executing the
    // autocompletion.
    self.delSuggestion();

    // Do not trigger the browser's default keyboard shortcut.
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
};

/**
 * Responds to keyup events in the bound element.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.keyupHandler = function (event) {
  // Don't interfere with text selections.
  if (this.selectionStart !== this.selectionEnd) {
    return;
  }
  // Skip special keystrokes.
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  var self = event.data.syntax, pos = this.selectionEnd;
  // Retrieve the needle: The word before the cursor.
  var needle = this.value.substring(0, pos).match(/[^\s>(]+$/);
  // If there is a needle, check whether to show a suggestion.
  // @todo Revamp the entire following conditional code to call
  //   delSuggestion() only once.
  if (needle) {
    self.needle = needle[0];
    // If the needle is found in the haystack of suggestions, show a suggestion.
    var suggestion;
    if (suggestion = self.checkSuggestion(self.needle)) {
      self.setSuggestion(suggestion);
    }
    // Otherwise, ensure a possibly existing last suggestion is removed.
    else {
      self.delSuggestion();
    }
  }
  // Otherwise, ensure there is no suggestion.
  else {
    self.delSuggestion();
  }
};

/**
 * Determines whether there is a suggestion for a given needle.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.checkSuggestion = function (needle) {
  var self = this, suggestion = false;
  $.each(self.suggestions, function () {
    if ($.isFunction(this)) {
      // Use .call() to provide self in this.
      if (suggestion = this.call(self, needle)) {
        return false;
      }
    }
    else if (this[needle]) {
      if (suggestion = this[needle]) {
        return false;
      }
    }
  });
  return suggestion;
};

/**
 * Sets the suggestion and shows the autocompletion tooltip.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.setSuggestion = function (suggestion) {
  var self = this;
  if (suggestion !== self.suggestion) {
    self.suggestion = suggestion;
    self.$suggestion.text(self.suggestion.replace('^', ''));
    self.$tooltip.show();
  }
};

/**
 * Deletes the suggestion and hides the autocompletion tooltip.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.delSuggestion = function () {
  var self = this;
  delete self.suggestion;
  self.$tooltip.hide();
};

Drupal.dreditor.syntaxAutocomplete.prototype.suggestions = {};

/**
 * Look-up map for simple HTML/markup suggestions.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.suggestions.html = {
  '<?': "<?php\n^\n?>\n",
  '<a': '<a href="^"></a>',
  '<block': "<blockquote>^</blockquote>\n\n",
  '<br': "<br />\n^",
  '<cite': '<cite>^</cite>',
  '<code': '<code>^</code>',
  '<del': '<del>^</del>',
  '<dl': "<dl>\n<dt>^</dt>\n<dd></dd>\n</dl>\n",
  '<dt': "<dt>^</dt>\n<dd></dd>",
  '<dd': '<dd>^</dd>',
  '<em': '<em>^</em>',
  '<h1': "<h1>^</h1>\n",
  '<h2': "<h2>^</h2>\n",
  '<h3': "<h3>^</h3>\n",
  '<h4': "<h4>^</h4>\n",
  '<h5': "<h5>^</h5>\n",
  '<h6': "<h6>^</h6>\n",
  '<hr': "<hr />\n\n^",
  '<img': '<img src="^" />',
  '<li': "<li>^</li>",
  '<ol': "<ol>\n^\n</ol>\n",
  '<p': "<p>^</p>\n",
  '<pre': "<pre>\n^\n</pre>\n",
  '<q': '<q>^</q>',
  '<strong': '<strong>^</strong>',
  '<table': "<table>\n<tr>\n<th>^</th>\n</tr>\n<tr>\n<td></td>\n</tr>\n</table>\n",
  '<tr': "<tr>\n^\n</tr>",
  '<th': "<th>^</th>",
  '<td': "<td>^</td>",
  '<u': '<u>^</u>',
  '<ul': "<ul>\n^\n</ul>\n"
};

/**
 * Suggest a [#issue] conversion for Project Issue input filter.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.suggestions.issue = function (needle) {
  var matches;
  https://www.drupal.org/project/drupal/issues/3231503
  if (matches = needle.match('^https?://(?:www.)?drupal.org/node/([0-9]+)')) {
    return '[#' + matches[1] + ']^';
  }
  if (matches = needle.match('^https?://(?:www.)?drupal.org/project/([a-z_]+)/issues/([0-9]+)')) {
    return '[#' + matches[2] + ']^';
  }
  return false;
};

/**
 * Suggest a username.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.suggestions.user = function (needle) {
  var matches, self = this;
  if (matches = needle.match('^@([a-zA-Z0-9]+)$')) {
    // Performance: Upon first match, setup a username list once.
    if (typeof self.suggestionUserList === 'undefined') {
      self.suggestionUserList = {};
      var seen = {};
      // Add issue author to comment authors and build the suggestion list.
      $('.comment a.username').add('.node .submitted a.username').each(function () {
        if (!seen[this.text]) {
          seen[this.text] = 1;
          // Use the shortest possible needle.
          var i, n, name = this.text.toLowerCase();
          for (i = 1; i < name.length; i++) {
            n = name.substring(0, i);
            if (!self.suggestionUserList[n]) {
              self.suggestionUserList[n] = '@' + this.text + '^';
              break;
            }
          }
        }
      });
    }
    if (self.suggestionUserList[matches[1]]) {
      return self.suggestionUserList[matches[1]];
    }
  }
  return false;
};

/**
 * Suggest a comment on issue.
 */
Drupal.dreditor.syntaxAutocomplete.prototype.suggestions.comment = function (needle) {
  var matches, self = this;
  if (matches = needle.match('^#([0-9]+)$')) {
    // Performance: Upon first match, setup a username list once.
    if (typeof self.suggestionCommentList === 'undefined') {
      self.suggestionCommentList = {
        0: 'content'
      };
      // Add issue author to comment authors and build the suggestion list.
      var n, id;
      $('.comment a.permalink').each(function () {
        n = this.text.substring(9);
        id = this.hash.substring(1);
        self.suggestionCommentList[n] = id;
      });
    }
    if (self.suggestionCommentList[matches[1]]) {
      return '<a href="#' + self.suggestionCommentList[matches[1]] + '">#' + matches[1] + '</a>^';
    }
  }
  return false;
};

(function () {
    // dreditor.css
    var cssText = "" +
"#dreditor-wrapper{position:fixed;z-index:1000;width:100%;top:0}#dreditor{position:relative;width:100%;height:100%;background-color:#fff;border:1px solid #ccc}#dreditor.resizing{cursor:ew-resize;-moz-user-select:none;-webkit-user-select:none;user-select:none}#dreditor #bar,#dreditor-actions{padding:0 10px;font:10px/18px sans-serif,verdana,tahoma,arial;min-width:230px}#dreditor #bar{float:left;height:100%;position:relative}#dreditor #bar .resizer{bottom:0;cursor:ew-resize;display:block;position:absolute;right:-1px;top:0;width:6px;z-index:9999}#dreditor #bar .resizer:hover,#dreditor #bar .resizer.resizing{background:rgba(0,0,0,.1)}#dreditor-actions{bottom:0;left:-5px;padding-top:5px;padding-bottom:5px;position:absolute}.dreditor-button,.dreditor-button:link,.dreditor-button:visited,#page a.dreditor-button{background:#7abcff;background:-moz-linear-gradient(top,#7abcff 0,#60abf8 44%,#4096ee 100%);background:-webkit-gradient(linear,left top,left bottom,color-stop(0%,#7abcff),color-stop(44%,#60abf8),color-stop(100%,#4096ee));background:-webkit-linear-gradient(top,#7abcff 0,#60abf8 44%,#4096ee 100%);background:-o-linear-gradient(top,#7abcff 0,#60abf8 44%,#4096ee 100%);background:-ms-linear-gradient(top,#7abcff 0,#60abf8 44%,#4096ee 100%);background:linear-gradient(to bottom,#7abcff 0,#60abf8 44%,#4096ee 100%);filter:progid:DXImageTransform.Microsoft.gradient(startColorstr='#7abcff', endColorstr='#4096ee', GradientType=0);border:1px solid #3598E8;color:#fff;cursor:pointer;font-size:11px;font-family:sans-serif,verdana,tahoma,arial;font-weight:700;padding:.1em .8em;text-transform:uppercase;text-decoration:none;moz-border-radius:3px;webkit-border-radius:3px;border-radius:3px;box-shadow:0 1px 2px rgba(0,0,0,.2)}.dreditor-button:hover,#page a.dreditor-button:hover{background:#91c8ff;background:-moz-linear-gradient(top,#91c8ff 0,#60abf8 44%,#5ea6ed 100%);background:-webkit-gradient(linear,left top,left bottom,color-stop(0%,#91c8ff),color-stop(44%,#60abf8),color-stop(100%,#5ea6ed));background:-webkit-linear-gradient(top,#91c8ff 0,#60abf8 44%,#5ea6ed 100%);background:-o-linear-gradient(top,#91c8ff 0,#60abf8 44%,#5ea6ed 100%);background:-ms-linear-gradient(top,#91c8ff 0,#60abf8 44%,#5ea6ed 100%);background:linear-gradient(to bottom,#91c8ff 0,#60abf8 44%,#5ea6ed 100%);filter:progid:DXImageTransform.Microsoft.gradient(startColorstr='#91c8ff', endColorstr='#5ea6ed', GradientType=0)}.dreditor-button:active,#page a.dreditor-button:active{background:#4096ee;background:-moz-linear-gradient(top,#4096ee 0,#60abf8 56%,#7abcff 100%);background:-webkit-gradient(linear,left top,left bottom,color-stop(0%,#4096ee),color-stop(56%,#60abf8),color-stop(100%,#7abcff));background:-webkit-linear-gradient(top,#4096ee 0,#60abf8 56%,#7abcff 100%);background:-o-linear-gradient(top,#4096ee 0,#60abf8 56%,#7abcff 100%);background:-ms-linear-gradient(top,#4096ee 0,#60abf8 56%,#7abcff 100%);background:linear-gradient(to bottom,#4096ee 0,#60abf8 56%,#7abcff 100%);filter:progid:DXImageTransform.Microsoft.gradient(startColorstr='#4096ee', endColorstr='#7abcff', GradientType=0)}.dreditor-button{margin:0 .5em .5em}.dreditor-patchreview,.dreditor-patchtest,.dreditor-inlineimage{float:right;line-height:1.25em;margin:0 0 0 1em}#dreditor h3{margin:18px 0 0}#dreditor #menu{margin:0;max-height:30%;overflow-y:scroll;padding:0}#dreditor #menu li{list-style:none;margin:0;white-space:nowrap}#dreditor #menu li li{padding:0 0 0 1em}#dreditor #menu>li>a{display:block;padding:0 0 0 .2em;background-color:#f0f0f0}#dreditor a{text-decoration:none;background:0 0}#dreditor .form-textarea{width:100%;height:12em;font:13px Consolas,'Liberation Mono',Courier,monospace;color:#000}#dreditor .resizable-textarea{margin:0 0 9px}#dreditor-content{border-left:1px solid #ccc;overflow:scroll;height:100%}#dreditor-content,#code tr,#code td{font:13px/18px Consolas,'Liberation Mono',Courier,monospace}#dreditor #code{position:relative;width:100%}#dreditor #code td{overflow:hidden;padding:0 10px}#dreditor #code .ln{width:1px;border-right:1px solid #e5e5e5;text-align:right}#dreditor #code .ln:before{content:attr(data-line-number)}#dreditor #code tr{background-color:transparent;border:0;color:#888;margin:0;padding:0}#dreditor #code .pre{white-space:pre}#dreditor #code thead .line-ruler{border-left:1px solid rgba(0,0,0,.15);position:absolute;height:100%;width:1px;top:0;padding:0;visibility:hidden}#dreditor #code .pre span.space{display:inline-block;margin-left:1px;width:2px;height:7px;background-color:#ddd}#dreditor #code .pre span.error{background-color:#f99;line-height:100%;width:auto;height:auto;border:0}#dreditor #code .pre span.error.eof{color:#fff;background-color:#f66}#dreditor #code .pre span.error.tab{background-color:#fdd}#dreditor #code .pre span.hidden{display:none}#dreditor #code tr.file{background-color:#E8F1F6;color:#064A6F}#dreditor #code tr.file a{color:#064A6F}#dreditor #code tr.file .ln{background-color:#DAEAF3;border-color:#BFD4EE}#dreditor #code tr.old{background-color:#fdd;color:#c00}#dreditor #code tr.old a{color:#c00}#dreditor #code tr.old .ln{background-color:#f7c8c8;border-color:#e9aeae}#dreditor #code tr.new{background-color:#dfd;color:#008503;float:none;font-size:100%;font-weight:400}#dreditor #code tr.new a{color:#008503}#dreditor #code tr.new .ln{background-color:#ceffce;border-color:#b4e2b4}#dreditor #code .comment{color:#070}tr.selected td{background:0 0}#dreditor #code tr:hover,#dreditor #code tr:hover td,#dreditor #code tr:hover td a{background:#FFF4CE!important;border-color:#F3D670!important;color:#BB7306!important;cursor:pointer}#dreditor #code tr.selected,#dreditor #code tr.pre-selected,#dreditor #code tr.has-comment{background:#FFF4CE;cursor:pointer}#dreditor #code tr.selected .ln,#dreditor #code tr.pre-selected .ln,#dreditor #code tr.has-comment .ln{background:#FFECAB;border-color:#EBD17B}#dreditor #code tr.selected:hover,#dreditor #code tr.pre-selected:hover,#dreditor #code tr.has-comment:hover,#dreditor #code tr.selected:hover td,#dreditor #code tr.pre-selected:hover td,#dreditor #code tr.has-comment:hover td,#dreditor #code tr.selected:hover td a,#dreditor #code tr.pre-selected:hover td a,#dreditor #code tr.has-comment:hover td a{background:#fff!important}#dreditor #code tr:hover td{box-shadow:0 -1px 0 0 #fcd773 inset,0 1px 0 0 #fcd773 inset}.element-invisible{clip:rect(1px,1px,1px,1px);position:absolute!important}.admin-link{font-size:11px;font-weight:400;text-transform:lowercase}small .admin-link:before{content:'['}small .admin-link:after{content:']'}#dreditor-overlay{margin-top:18px;font-size:13px}#column-left{z-index:2}#dreditor-widget{position:fixed;bottom:0;left:2%;width:94%;z-index:10;overflow:auto;padding:0 1em 1em;background-color:#fff;moz-box-shadow:0 0 20px #bbb;box-shadow:0 0 20px #bbb;moz-border-radius:8px 8px 0 0;border-radius:8px 8px 0 0}#dreditor-widget .sticky-cancel{bottom:0;position:absolute;right:1em}.dreditor-actions{overflow:hidden;position:relative}a.dreditor-application-toggle{display:inline-block;padding:.05em .3em;line-height:150%;border:1px solid #ccc;background-color:#fafcfe;font-weight:400;text-decoration:none}a.dreditor-application-toggle .ajax-progress{float:right;margin:-1px -5px 0 2px}a.dreditor-application-toggle.active{border-color:#48e;background-color:#4af;color:#fff}#page a.dreditor-application-toggle{float:right;margin:0 0 0 .5em}.dreditor-input{border:1px solid #ccc;padding:.2em .3em;font-size:100%;line-height:150%;moz-box-sizing:border-box;box-sizing:border-box;width:100%}.choice{display:inline-block;margin:0 .33em .4em 0;padding:.2em .7em;border:1px solid #ccc;background-color:#fafcfe;moz-border-radius:5px;border-radius:5px}.choice.selected{background-color:#2e96d5;border:1px solid #28d;color:#fff}div.dreditor-issuecount{line-height:200%}.dreditor-issuecount a{padding:0 .3em}.marker.clickable{cursor:pointer}#page .fieldset-flat{display:block;border:0;width:auto;padding:0}.fieldset-flat>legend{display:none}#dreditor-issue-data #edit-title-wrapper{margin-top:0}#dreditor-issue-data .inline-options .form-item{margin-bottom:.3em}.dreditor-tooltip{display:none;position:fixed;bottom:0;background-color:#ffffbf;border:1px solid #000;padding:0 3px;font-family:sans-serif;font-size:11px;line-height:150%;z-index:100}.field-name-field-issue-files table,.field-name-field-issue-changes table.nodechanges-file-changes{width:100%}.extended-file-field-table-cid,th[name=extended-file-field-table-header-cid]{width:100px;word-wrap:break-word}.field-name-field-issue-changes table td .file{display:block}td.extended-file-field-table-cid{text-align:right}td.extended-file-field-table-cid .username{color:#777;display:block;font-size:10px}td.extended-file-field-table-filename .file,tr.pift-file-info .file{font-weight:600}td.extended-file-field-table-filename .file a,tr.pift-file-info .file a{display:block;overflow:hidden}td.extended-file-field-table-filename .file .file-icon,tr.pift-file-info .file .file-icon{float:left;margin-right:.5em}td.extended-file-field-table-filename .file .size,tr.nodechanges-file-changes .file .size{color:#999;float:right;font-size:10px;margin-left:.5em}tr.extended-file-field-table-row td,.field-name-field-issue-changes table.nodechanges-file-changes td{padding:.75em}tr.extended-file-field-table-row:not(.pift-test-info) td.pift-pass,tr.extended-file-field-table-row:not(.pift-test-info) td.pift-fail,table.nodechanges-file-changes .pift-file-info td.pift-pass,table.nodechanges-file-changes .pift-file-info td.pift-fail{padding-bottom:0}tr.pift-test-info td{font-size:11px;font-style:italic;padding:.5em .75em .75em 2.9em}div.pift-operations{float:right;font-size:10px;font-style:normal;font-weight:600;margin-left:1em;text-transform:uppercase}";
    // cssText end

    var styleEl = document.createElement("style");
    document.getElementsByTagName("head")[0].appendChild(styleEl);
    if (styleEl.styleSheet) {
        if (!styleEl.styleSheet.disabled) {
            styleEl.styleSheet.cssText = cssText;
        }
    } else {
        try {
            styleEl.innerHTML = cssText
        } catch(e) {
            styleEl.innerText = cssText;
        }
    }
}());

// Enable detection of installed chrome extension on dreditor.org.
if (window.location.href.match('dreditor.org')) {
  var isInstalledNode = document.createElement('div');
  isInstalledNode.id = 'dreditor-is-installed';
  document.body.appendChild(isInstalledNode);
}

jQuery(document).ready(function () {
  Drupal.attachBehaviors(this);
});

// Invoke Dreditor update check once.
Drupal.dreditor.updateCheck();
/*jshint ignore:start*/
// End of Content Scope Runner.
};
/*jshint ignore:end*/

// If not already running in the page, inject this script into the page.
if (typeof __PAGE_SCOPE_RUN__ === 'undefined') {
  // Define a closure/function in the global scope in order to reference the
  // function caller (the function that executes the user script itself).
  (function page_scope_runner() {
    // Retrieve the source of dreditor_loader, inject and run.
    var self_src = '(' + dreditor_loader.toString() + ')(jQuery);';

    // Add the source to a new SCRIPT DOM element; prepend it with the
    // __PAGE_SCOPE_RUN__ marker.
    // Intentionally no scope-wrapping here.
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.textContent = "var __PAGE_SCOPE_RUN__ = true;\n" + self_src;

    // Inject the SCRIPT element into the page.
    var head = document.getElementsByTagName('head')[0];
    head.appendChild(script);
  })();

  // End execution. This code path is only reached in a GreaseMonkey/user
  // script environment. User script environment implementations differ; not all
  // browsers (e.g., Opera) understand a return statement here, and it would
  // also prevent inclusion of this script in unit tests. Therefore, the entire
  // script needs to be wrapped in a condition.
}
// Drupal is undefined when drupal.org is down.
else if (typeof Drupal === 'undefined') {
}
// Execute the script as part of the content page.
else {
  dreditor_loader(jQuery); /*jshint ignore:line*/
}

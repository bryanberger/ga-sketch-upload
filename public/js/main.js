// $.featherlight.autoBind = false;
$(function() {
  // const wss_url = 'wss://ga-product-dashboard-tv.herokuapp.com';
  const wss_url = 'ws://localhost:3000';
  var ids_cache = [];
  var timer_id = 0;
  var socket;
  var items_max = 20;
  var items = [];

  window.$grid = $('#grid').packery({
    itemSelector: '.grid-item',
    gutter: '.gutter-sizer',
    percentPosition: true
  });

  $('#grid').featherlightGallery({
    filter: '.grid-item-link',
    gallery: {
      fadeIn: 500,
      fadeOut: 500
    },
    openSpeed: 500,
    closeSpeed: 500
  });

  $('.btn-load-all').click(function(e) {
    $(this).remove();
    reloadItems(true);
  });

  init = function() {
    if (typeof socket !== 'undefined') { socket.close(); }
    socket = null;
    socket = new WebSocket(wss_url);

    socket.onopen = function (event) {
      if(timer_id) { /* a setInterval has been fired */
        clearInterval(timer_id);
        timer_id = 0;
      }

      startPing();
    };

    socket.onclose = function (event) {
      console.log('socket.onclose');

      // try to reconnect in 10 seconds
      if(!timer_id) {
       timer_id = setInterval(function() { init() }, 10000);
      }
    };

    socket.onmessage = function (event) {
      items = JSON.parse(event.data);
      // remove preloader on first message
      $('.preloader').remove();
      $('.btn-load-all').show();

      // reloadItems
      reloadItems();
    };
  }

  reloadItems = function(loadAll) {
    var ids_to_add = [];
    var ids_to_remove = [];

    // clear cache if loading all
    if(loadAll) {
      $('.grid-item').remove();
      ids_cache = []
    }

    var ids = items.map(function(item) {
      // item.filename = encodeURIComponent(item.filename); // encode
      return item.id;
    })

    if(ids_cache.length === 0) {
      ids_to_add = ids;
    } else {
      ids_to_remove = ids_cache.filter(function(item) {
        return ids.indexOf(item) === -1;
      });

      ids_to_add = ids.filter(function(item) {
        return ids_cache.indexOf(item) === -1;
      });
    }

    // cache ids
    ids_cache = ids;

    // ids to remove
    if(ids_to_remove.length > 0) {
      $.each(ids_to_remove, function(index, id) {
        var $elem = $('#grid').find('[data-id="'+id+'"]');

        $grid.packery('remove', $elem)
          .packery('shiftLayout');
      });
    }

    // ids to add
    if(ids_to_add.length > 0) {
      var i = 0;
      var items_len = items.length;

      // items.map(function(item) {
      items.slice( (typeof loadAll === 'undefined') ? -items_max : 0).map(function(item) {
        if(ids_to_add.indexOf(item.id) > -1) {
          var itemStr = '';

          itemStr += '<div class="grid-item" data-id="' + item.id + '">';
          if(item.extension === '.mp4' || item.extension === '.mov') {
            items_len--; // KLUDGE remove videos from imagesLoaded check
            itemStr +='<a class="grid-item-link" href="/video?url=' + encodeURIComponent(item.url) + '" data-featherlight="iframe">';
            itemStr += '<video class="grid-item-img" autoplay loop"><source src="' + item.url + '" type="video/mp4" data-filename="' + item.filename + '"></video>';
          } else {
            itemStr +='<a class="grid-item-link" href="' + item.url + '" data-featherlight="image">';
            itemStr +='<img class="grid-item-img" src="' + item.url + '" data-filename="' + item.filename + '"/>';
          }
          itemStr +='</a>';
          itemStr +=  '<ul class="grid-item-meta"><li>' + item.user;
          itemStr +=', <span>' + item.artboard + '</span></li></ul></div>';

          // checkWindowHash($item, item.filename);
          var $item = $(itemStr);

          $grid.packery()
            .prepend($item)
            .packery('prepended', $item)
            .packery();
        }
      });
    }

    // just in case, relayout after image loads
    $grid.imagesLoaded().progress(function() {
      $grid.packery();
      i++;

      // end of array
      if(i === items_len) {
        allImagesLoaded();
      }
    });
  }

  function allImagesLoaded() {
    // now load and pack all videos
    $('video').on('loadeddata', function() {
      $grid.packery();
    });

    // loop workaround
    $('video').on('ended', function () {
      this.play();
    });

    checkWindowHash();
  }

  // function checkWindowHash($item, filename) {
  function checkWindowHash($item, filename) {
    // check hashes
    if(window.location.hash) {
      var hash = window.location.hash.substring(1);
      var $items = $('.grid-item');

      // if(filename === hash) {
      //   $.featherlight($item.find('.grid-item-link'));
      // }

      $.each($items, function(index, elem) {
        var $elem = $(elem);
        var $found = $elem.find('[data-filename="' + hash + '"]')

        if($found.length === 1) {
          // open it (FIX: this opens the item outside of the Gallery context)
          $.featherlight($elem.find('.grid-item-link'));
          return false
        }
      });
    }
  }

  function startPing() {
    if(!socket) return;

    // ping websocket server every 25s to keep connection alive
    setInterval(function() {
      if(socket && (socket.readyState !== socket.CLOSING && socket.readyState !== socket.CLOSED && socket.readyState !== socket.CONNECTING)) {
        socket.send(JSON.stringify(new Date()));
      }
    }, 25000);
  }

  // init
  init();
});

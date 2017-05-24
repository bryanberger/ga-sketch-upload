// $.featherlight.autoBind = false;
$(function() {
  const wss_url = 'wss://ga-product-dashboard-tv.herokuapp.com';
  var ids_cache = [];
  var timer_id = 0;
  var socket;

  window.$grid = $('#grid').packery({
    itemSelector: '.grid-item',
    gutter: '.gutter-sizer',
    percentPosition: true
  });

  $grid.imagesLoaded().progress(function() {
    $grid.packery();
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

  init = function() {
    socket = null;
    socket = new WebSocket(wss_url);
    socket.onopen = function (event) {
      if(timer_id) { /* a setInterval has been fired */
        clearInterval(timer_id);
        timer_id = 0;
      }

      socket.send('Hello server!');
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
      var items = JSON.parse(event.data);
      var ids_to_add = [];
      var ids_to_remove = [];

      // remove preloader on first message
      $('.preloader').remove();

      var ids = items.map(function(item) {
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
        items.map(function(item) {
          if(ids_to_add.indexOf(item.id) > -1) {
            var $item = $(
            '<div class="grid-item" data-id="' + item.id + '">' +
            '<a class="grid-item-link" href="' + item.url + '" data-featherlight="image">' +
            '<img class="grid-item-img" src="' + item.url + '" data-filename="' + item.filename + '"/>' +
            '</a>' +
            '<ul class="grid-item-meta"><li>' + item.user +
            ', <span>' + item.artboard + '</span></li></ul></div>');

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

    };
  }
  init();

  function allImagesLoaded() {
    // check hashes
    if(window.location.hash) {
      var hash = window.location.hash.substring(1);
      var $items = $('.grid-item');

      $.each($items, function(index, elem) {
        var $elem = $(elem);
        var $found = $elem.find(`[data-filename='${hash}']`);
        if($found) {
          $.featherlight($elem.find('.grid-item-link'));
        }
      });
    }
  }

  function startPing() {
    if(!socket) return;

    // ping websocket server every 25s to keep connection alive
    setInterval(function() {
      if(socket && (socket.readyState !== socket.CLOSING || socket.readyState !== socket.CLOSED || socket.readyState !== socket.CONNECTING)) {
        socket.send(JSON.stringify(new Date()));
      }
    }, 25000);
  }
});

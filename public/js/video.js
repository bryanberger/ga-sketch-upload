$(function(){
  function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
  };
  var url = getUrlParameter('url');

  if(url){
    $('body').append('<video autoplay loop"><source src="' + url + '&raw=1' + '" type="video/mp4"></video>');
    $('video').on('ended', function () {
      this.play();
    });
  }
})

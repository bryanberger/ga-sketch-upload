var IncomingWebhook = require('@slack/client').IncomingWebhook;
var url = process.env.SLACK_WEBHOOK_URL || '';
var webhook = new IncomingWebhook(url);

var self = module.exports = {

  notify: notify = function(msg) {
    webhook.send(msg, function(err, res) {
      if (err) {
        console.log('Error:', err);
        return err;
      } else {
        return res;
      }
    })
  }
}

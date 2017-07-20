function membershipHook (ctx, callback) {
  var LOG_PREFIX = 'membershipHook: ';

  // configure these:
  var AUTH0_DOMAIN = 'your-tenant.auth0.com';
  var MEMBERSHIPS_HOOK_CLIENT_ID = 'memberships-hook-client-id';
  var MEMBERSHIPS_HOOK_CLIENT_SECRET = 'memberships-hook-client-seceret';
  var AUTHZ_API_BASE_URL = 'https://your-tenant.us.webtask.io/adf6e2f2b84784b57522e3b19dfc9201/api';
    
  // TODO: replace with 'request' library when available
  var request = {
    _request: function (options, done) {
      var url = require('url');
      var querystring = require('querystring');
      var https = require('https');
      var Buffer = require('buffer').Buffer;

      // url parsing
      var requestUrl = url.parse(options.url);
      if (options.qs) {
        var query = querystring.parse(requestUrl.query);
        for (var key in options.qs) {
          query[key] = options.qs[key];
        }
        requestUrl.query = query;
        delete requestUrl.search;
        requestUrl = url.parse(url.format(requestUrl));
      }

      // basic options
      var requestOptions = {
        hostname: requestUrl.hostname,
        port: requestUrl.port,
        path: requestUrl.path,
        method: options.method,
        headers: {}
      };

      // data
      var jsonData = null;
      if (options.json) {
        requestOptions.headers['Accept'] = 'application/json';
        if (typeof options.json !== 'boolean' && (options.method === 'POST' || options.method === 'PUT')) {
          requestOptions.headers['Content-Type'] = 'application/json';
          jsonData = JSON.stringify(options.json);
          requestOptions.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }
      }

      // auth
      if (options.auth) {
        if (options.auth.bearer) {
          requestOptions.headers['Authorization'] = 'Bearer ' + options.auth.bearer;
        }
      }

      // issue request
      var req = https.request(requestOptions, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });      
        res.on('end', function () {
          if (options.json) {
            data = JSON.parse(data);
          }

          return done(null, res, data);
        });
      });
      req.on('error', function (err) {
        return done(err);
      });
      if (jsonData) {
        req.write(jsonData);
      }
      req.end();
    },

    get: function (options, done) {
      options.method = 'GET';
      return this._request(options, done);
    },

    post: function (options, done) {
      options.method = 'POST';
      return this._request(options, done);
    },

    patch: function (options, done) {
      options.method = 'PATCH';
      return this._request(options, done);
    }
  };

  function clientCredentials (audience, done) {
    request.post({
      url: 'https://' + AUTH0_DOMAIN + '/oauth/token',
      json:{
        grant_type: 'client_credentials',
        client_id: MEMBERSHIPS_HOOK_CLIENT_ID,
        client_secret: MEMBERSHIPS_HOOK_CLIENT_SECRET,
        audience: audience
      }
    }, function (err, response, body) {
      if (err) return done(err);
      if (response.statusCode !== 200) {
        var message = 'Error performing client credentials grant';
        ctx.log(LOG_PREFIX + message + ':', response.statusCode, body);
        return done(new Error(message));
      }
      
      done(null, body.access_token);
    });
  }

  clientCredentials('urn:auth0-authz-api', function (err, accessToken) {
    if (err) return callback(err);

    // get list of available roles
    request.get({
      url: AUTHZ_API_BASE_URL + '/roles',
      auth: { bearer: accessToken },
      json: true
    }, function (err, response, body) {
      if (err) return callback(err);
      if (response.statusCode !== 200) {
        var message = 'Error fetching available roles';
        ctx.log(LOG_PREFIX + message + ':', response.statusCode, body);
        return callback(new Error(message));
      }

      var roleNames = body.roles.map(function (role) {
        return role.name;
      });

      ctx.log(LOG_PREFIX + 'Loaded ' + roleNames.length + ' roles into the membership list.');

      return callback(null, roleNames);
    });
  });
}


// TEST HARNESS - Do not copy into Memberships Hook in the extension's Configuration page

var ctx = {
  log: console.log
};

membershipHook(ctx, function (err, data) {
  console.log('data:', data);
});

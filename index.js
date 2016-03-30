'use strict';

var app = require('app');
var BrowserWindow = require('browser-window');
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
const ipcMain = require('electron').ipcMain;

require('crash-reporter').start();

var mainWindow = null;
var SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + './token.json';
var result = "";    //認証時のコードを一時的に受ける関数

app.on('window-all-closed', function() {
  if (process.platform != 'darwin')
    app.quit();
});

app.on('ready', function() {
  // メイン画面の表示。ウィンドウの幅、高さを指定できる
  mainWindow = new BrowserWindow({
	  'width': 450,
	  'height': 450,
    "transparent": false,    // ウィンドウの背景を透過
    "frame": true,     // 枠の無いウィンドウ
    "resizable": false,  // ウィンドウのリサイズを禁止
	  'autoHideMenuBar':true
  });

  mainWindow.loadURL('file://' + __dirname + '/index.html');

  // ウィンドウが閉じられたらアプリも終了
  mainWindow.on('closed', function() {
    mainWindow = null;
  });
});

/**
 * ipc処理　非同期
 *
 * @param {async}
 */
ipcMain.on('async', function( event, args ){
  　//シークレット取得
	  fs.readFile((process.env.HOME || process.env.HOMEPATH ||
        process.env.USERPROFILE) +'/client_secret.json', function processClientSecrets(err, content) {
	  if (err) {
  		console.log('Error loading client secret file: ' + err);
  		return;
	  }
    result = args;
    // Google Calendar API　の認証処理へ
	  authorize(JSON.parse(content), callCalendarApi);
	});

});

/**
 * 認証処理
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      //トークンがなければ新規取得
      getNewToken(oauth2Client, callback);
    } else {
      //トークンがあればコールバックの処理へ
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * トークン取得
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });

  if(result == ""){
  	//HTML側へ認証要求とコード入力を促す
  	mainWindow.webContents.send('async-url', authUrl );
  }else{
	console.log("oauth");
    oauth2Client.getToken(result, function(err, token) {
      if (err) {
        mainWindow.webContents.send('message', "アクセストークンファイルが開けません" );
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  }
}

/**
 * トークンの保存
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * GoogleCalendar　API 取得処理
 *
 * @param {Object} token The token to store to disk.
 */
function callCalendarApi(auth) {
  var now = new Date();
  var startTime = now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2)+'-'+('0'+now.getDate()).slice(-2)+ 'T0:00:00+09:00';
  var endTime = now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2)+'-'+('0'+now.getDate()).slice(-2)+ 'T23:59:59+09:00';
  var calendar = google.calendar('v3');
  calendar.events.list({
    auth: auth,
    calendarId: 'techno-wing.co.jp_38353836303238362d363530@resource.calendar.google.com',
    timeMin: startTime,
    timeMax: endTime,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var events = response.items;
    if (events.length == 0) {
      console.log('No upcoming events found.');
    } else {
      //データ作成
      var items = new Array();
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var start = event.start.dateTime || event.start.date;
        var item = new Object();

        //時間
        var dt = new Date( event.start.dateTime);
        var hour = '0' + dt.getHours();
        hour = hour.substr(hour.length -2,2);
        var time = '0' + dt.getMinutes();
        time = time.substr(time.length -2,2);
        item.time = hour + ':' + time;
        //件名
        item.title = event.organizer.displayName;
        //詳細
        if(event.description !== undefined){
          item.description = event.description;
        }else{
          item.description = '';
        }
        items.push(item);
      }
      //データ設定
      mainWindow.webContents.send('setdata', items);
    }
  });
}

String.prototype.validate = function () {
    return this.replace(/-/g, '__').replace(/\?/g, '-qmark').replace(/ /g, '--').replace(/\n/g, '-n').replace(/</g, '-lt').replace(/>/g, '-gt').replace(/&/g, '-amp').replace(/#/g, '-nsign').replace(/__t-n/g, '__t').replace(/\+/g, '_plus_').replace(/=/g, '-equal');
};


/* -------------------------------------------------------------------------------------------------------------------------- */

window.PeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection || window.RTCPeerConnection;
window.SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.RTCSessionDescription;
window.IceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.RTCIceCandidate;

//window.URL = window.webkitURL || window.URL;
window.URL = window.URL;
navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.getUserMedia;

/* -------------------------------------------------------------------------------------------------------------------------- */
var global = {};

var RTC = {}, peerConnection;

var chromeVersion = !!navigator.mozGetUserMedia ? 0 : parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2]);
var isChrome = !!navigator.webkitGetUserMedia;
var isFirefox = !!navigator.mozGetUserMedia;
global.AppointmentId = 0;
global.baseUrl = '';
global.AppoinmentType = appType; // 1 = Video, 2 = audio, 3 = text
global.FriendName = '';
global.isMobile = false;
global.isAlreadyLoaded = '0';
global.ErrorCount = 0;
var offererDataChannel, answererDataChannel;
RTC.init = function () {
    try {
        var iceServers = [];

        iceServers.push({
            url: 'turn:stun-turn.org:3478'
        });

        peerConnection = new window.PeerConnection({ "iceServers": iceServers });
        peerConnection.onicecandidate = RTC.checkLocalICE;
        peerConnection.oniceconnectionstatechange = function (evt) {
            DoLoggin('ice connection state change occured with response as: ');
            console.log(evt);
        };
        peerConnection.icecandidateerror = function (obj) {
            DoLoggin('icecandidateerror occured with response as: ');
            console.log(obj);
        };

        peerConnection.onaddstream = RTC.checkRemoteStream;
        peerConnection.addStream(global.clientStream);
    } catch (e) {
        //document.title = 'WebRTC is not supported in this web browser!';
        if (global.AppoinmentType != 3) {
            //console.log(e);
            var data = {
                appointmentId: global.AppointmentId,
                message: e + ' ErrorCount=' + global.ErrorCount
            };
            var theUrl = global.baseUrl;
            $.ajax(theUrl + '/LogError', {
                data: data,
                type: 'post',
                success: function () {

                }
            });
            if (e == "TypeMismatchError: Failed to execute 'addStream' on 'RTCPeerConnection': The 1st argument provided is either null, or an invalid MediaStream object." && global.ErrorCount < 3) {
                if (global.AppoinmentType == 1)
                    captureCamera();
                else if (global.AppoinmentType == 2)
                    captureAudio();

                global.ErrorCount++;
            }
            else {
                alert('Video Conferencing is not supported in this web browser!');
            }
        }
    }
};

var sdpConstraints = {
    //optional: [],
    //mandatory: {
    "offerToReceiveAudio": true, "offerToReceiveVideo": true
    //}
};

if (global.AppoinmentType == 2) {
    sdpConstraints = {
        "offerToReceiveAudio": true, "offerToReceiveVideo": false
    };
}
else if (global.AppoinmentType == 3) {
    sdpConstraints = {
        "offerToReceiveAudio": false, "offerToReceiveVideo": false
    };
}

RTC.createOffer = function () {

    RTC.init();

    offererDataChannel = peerConnection.createDataChannel('channel', {});
    setChannelEvents(offererDataChannel);

    peerConnection.createOffer(function (sessionDescription) {
        peerConnection.setLocalDescription(sessionDescription);

        sdp = JSON.stringify(sessionDescription);

        var data = {
            sdp: sdp,
            userToken: global.userToken,
            roomToken: global.roomToken
        };
        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/PostSDP', {
            data: data,
            type: 'post',
            success: function (response) {
                if (response) {
                    RTC.waitForAnswer();
                    if (global.isAlreadyLoaded == '1') {
                        global.isGotRemoteStream = false;
                        global.isAlreadyLoaded = '1';
                        RTC.checkRemoteICE();
                        isMeetingEnded = 0;
                    }
                    else {
                        global.isAlreadyLoaded = '1';
                        RTC.checkRemoteICE();
                    }
                    
                }
            }
        });

    }, onSdpError, sdpConstraints);
};

RTC.waitForAnswer = function () {

    var data = {
        userToken: global.userToken,
        roomToken: global.roomToken
    };
    var theUrl = global.baseUrl;
    $.ajax(theUrl + '/GetSDP', {
        data: data,
        type: 'post',
        success: function (response) {
            if (response !== false) {
                response = response.sdp;
                try {
                    sdp = JSON.parse(response);
                    peerConnection.setRemoteDescription(new window.SessionDescription(sdp));
                } catch (e) {
                    sdp = response;
                    peerConnection.setRemoteDescription(new window.SessionDescription(sdp));
                }
            } else
                setTimeout(RTC.waitForAnswer, 100);
        }
    });
};

RTC.waitForOffer = function () {
    var data = {
        userToken: global.userToken,
        roomToken: global.roomToken
    };
    var theUrl = global.baseUrl;
    $.ajax(theUrl + '/GetSDP', {
        data: data,
        type: 'post',
        success: function (response) {
            DoLoggin('waitForOffer Status = ' + response);
            if (response !== false) {
                RTC.createAnswer(response.sdp);
            } else setTimeout(RTC.waitForOffer, 100);
        }
    });
};

RTC.createAnswer = function (sdpResponse) {
    RTC.init();

    peerConnection.ondatachannel = function (event) {
        answererDataChannel = event.channel;
        setChannelEvents(answererDataChannel);
    };

    var sdp;
    try {
        sdp = JSON.parse(sdpResponse);

        peerConnection.setRemoteDescription(new window.SessionDescription(sdp));
    } catch (e) {
        sdp = sdpResponse;

        peerConnection.setRemoteDescription(new window.SessionDescription(sdp));
    }

    peerConnection.createAnswer(function (sessionDescription) {
        peerConnection.setLocalDescription(sessionDescription);

        sdp = JSON.stringify(sessionDescription);

        var data = {
            sdp: sdp,
            userToken: global.userToken,
            roomToken: global.roomToken
        };
        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/PostSDP', {
            data: data,
            type: 'post',
            success: function () {
                DoLoggin('createAnswer Status = ');
//                if (global.isAlreadyLoaded == '1' || peerConnection.iceConnectionState == "new") {
                if (global.isAlreadyLoaded == '1') {
                    global.isGotRemoteStream = false;
                    global.isAlreadyLoaded = '1';
                    RTC.checkRemoteICE();
                    isMeetingEnded = 0;
                }
                else {
                    global.isAlreadyLoaded = '1';
                    RTC.checkRemoteICE();
                }
            }
        });

    }, onSdpError);


};

RTC.checkRemoteICE = function () {
    if (peerConnection != undefined)
        DoLoggin('checkRemoteICE called global.isGotRemoteStream = ' + global.isGotRemoteStream + '    peerConnection.iceConnectionState= ' + peerConnection.iceConnectionState);
    else
        DoLoggin('checkRemoteICE called global.isGotRemoteStream = ' + global.isGotRemoteStream + '    peerConnection= undefined');

    if (global.isGotRemoteStream && peerConnection.iceConnectionState == "connected") return;

    if (!peerConnection) {
        setTimeout(RTC.checkRemoteICE, 1000);
        return;
    }
    if (peerConnection.iceConnectionState == "connected")
        return;
    var data = {
        userToken: global.userToken,
        roomToken: global.roomToken
    };
    var theUrl = global.baseUrl;
    $.ajax(theUrl + '/GetICE', {
        data: data,
        type: 'post',
        success: function (response) {
            DoLoggin('Get ICE returned: ' + response);
            console.log(response);
            if (response === false) {
                if (!global.isGotRemoteStream) setTimeout(RTC.checkRemoteICE, 1000);
            } 
            else {
                try {
                    candidate = new window.IceCandidate({ sdpMLineIndex: response.label, candidate: JSON.parse(response.candidate) });
                    peerConnection.addIceCandidate(candidate);
                    DoLoggin('a=');
                    !global.isGotRemoteStream && setTimeout(RTC.checkRemoteICE, 10);
                } catch (e) {
                    DoLoggin('b=');
                    DoLoggin(e);
                    try {
                        candidate = new window.IceCandidate({ sdpMLineIndex: response.label, candidate: JSON.parse(response.candidate) });
                        peerConnection.addIceCandidate(candidate);

                        !global.isGotRemoteStream && setTimeout(RTC.checkRemoteICE, 10);
                    } catch (e) {
                        DoLoggin('c=');
                        DoLoggin(e);
                        !global.isGotRemoteStream && setTimeout(RTC.checkRemoteICE, 1000);
                    }
                }
            }
        }
    });
};

RTC.checkLocalICE = function (event) {
    if (global.isGotRemoteStream) return;

    var candidate = event.candidate;
    DoLoggin('checkLocalICE');
    console.log(candidate);
    if (candidate) {
        var data = {
            candidate: JSON.stringify(candidate.candidate),
            label: candidate.sdpMLineIndex,
            userToken: global.userToken,
            roomToken: global.roomToken
        };
        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/PostICE', {
            data: data,
            type: 'post',
            success: function () {

            }
        });
    }
};

var remoteVideo = $('#remote-video');

RTC.checkRemoteStream = function (remoteEvent) {
    if (remoteEvent) {
        DoLoggin('checkRemoteStream');

        $('#remote-video')[0].play();

        if (!navigator.mozGetUserMedia) $('#remote-video')[0].src = window.URL.createObjectURL(remoteEvent.stream);
        else $('#remote-video')[0].mozSrcObject = remoteEvent.stream;

        RTC.waitUntilRemoteStreamStartFlowing();
    }
};

RTC.waitUntilRemoteStreamStartFlowing = function () {
    DoLoggin('waitUntilRemoteStreamStartFlowing');
    if (!(remoteVideo.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA || remoteVideo.paused || remoteVideo.currentTime <= 0)) {
        DoLoggin('Remote ready state = ' + remoteVideo.readyState + ' and shud be > ' + HTMLMediaElement.HAVE_CURRENT_DATA + ' & paused=' + remoteVideo.paused + ' & currentTime=' + remoteVideo.currentTime);
        global.isGotRemoteStream = true;
        DoLoggin('Got remote Stream');
        setTimeout(function () {
            if (global.AppoinmentType == 1) {
                //$('#reconnectingDiv').hide();
                //DoLoggin('hidding div');
                //$('#remote-video').show();
                if (global.isMobile == true) {
                    $('#client-video').removeClass('mainVideoMobile').addClass('smallVideo');
                }
                else {
                    $('#client-video').css('position', 'absolute').css('width', '200px').css('height', '140px').css('top', '625px').css('right', '17px');

                }
            }
        }, 1000);

        //document.title = 'Finally got the remote stream!';
    } else {
        DoLoggin('Remote ready state = ' + remoteVideo.readyState + ' and shud be > ' + HTMLMediaElement.HAVE_CURRENT_DATA + ' & paused=' + remoteVideo.paused + ' & currentTime=' + remoteVideo.currentTime);
        setTimeout(RTC.waitUntilRemoteStreamStartFlowing, 3000);
    }
};

/* -------------------------------------------------------------------------------------------------------------------------- */

var userid = Math.random() * 1000;
var chatArea = $('#chatarea');
function setChannelEvents(channel) {
    channel.onmessage = function (e) {
        e = JSON.parse(e.data);
        var data = e.data;
        // Don't get self sent messages
        if (e.senderid == userid) {
            //chatArea.html(chatArea.html() + '<div style="width:90%;"><b>You:</b>' + data + '</div>');
            return;
        }



        // if other user created offer; and sent you offer-sdp
        if (data.offerSDP) {
            window.answerer = Answerer.createAnswer(data.offerSDP);
        }

        // if other user created answer; and sent you answer-sdp
        if (data.answerSDP) {
            window.offerer.setRemoteDescription(data.answerSDP);
        }

        // if other user sent you ice candidates
        if (data.ice) {
            // it will be fired both for offerer and answerer
            (window.answerer || window.offerer).addIceCandidate(data.ice);
        }
        //        var existHtml = chatArea.html
        chatArea.html(chatArea.html() + '<div  class="chatMessage FriendMessage"><b>' + global.FriendName + ': </b>' + data + '</div>');
        //chatArea.append('<div style="width:90%;">' + data + '</div>');
    };



    channel.onopen = function () {
        DoLoggin('channel.open');

        if (global.AppoinmentType == 3) {
            $('#reconnectingDiv').hide();
            $('#divChat').show();
        }
        else if (global.AppoinmentType == 1) {
            setTimeout(function () {
                $('#reconnectingDiv').hide();
                $('#remote-video').show();
            }, 1000);
        }
        $('#btnSendMessage').show('inline');
        channel.push = channel.send;
        channel.send = function (data) {
            // wait/loop until socket connection gets open
            if (channel.readyState != 'open') {
                // websocket connection is not opened yet.
                return setTimeout(function () {
                    channel.send(data);
                }, 500);
            }

            // data is stringified because websocket protocol accepts only string data
            var json_stringified_data = JSON.stringify({
                senderid: userid,
                data: data
            });
            chatArea.html(chatArea.html() + '<div class="chatMessage SelfMessage"><b>You: </b>' + data + '</div>');

            var data = {
                message: data,
                appointmentId: global.AppointmentId,
                friendName: global.FriendName
            };
            var theUrl = global.baseUrl;
            $.ajax(theUrl + '/SendMessage', {
                data: data,
                type: 'post',
                success: function (response) {

                }
            });

            channel.push(json_stringified_data);
        };
    };

    channel.onerror = function (e) {
        console.error('channel.onerror', JSON.stringify(e, null, '\t'));
    };

    channel.onclose = function (e) {
        console.warn('channel.onclose', JSON.stringify(e, null, '\t'));
    };
}

global.mediaAccessAlertMessage = 'This app wants to use your camera and microphone.\n\nGrant it the access!';

var Room = {
    createRoom: function () {

        var data = {
            appointmentId: global.AppointmentId
        };

        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/CallNextPatient', {
            data: data,
            type: 'post',
            success: function (response) {
                if (response.Status == true) {
                    global.roomToken = response.roomToken;
                    global.userToken = response.ownerToken;

                    Room.waitForParticipant();
                }
            }
        });
    },
    RoomReadyForAppointment: function () {

        var data = {
            appointmentId: global.AppointmentId
        };

        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/RoomReadyForAppointment', {
            data: data,
            type: 'post',
            success: function (response) {
                DoLoggin('RoomReadyForAppointment Status = ' + response.Status);
                if (response.Status == true) {
                    Room.joinRoom(response.roomToken);
                }
            }
        });
    },
    joinRoom: function (token) {
        DoLoggin('Join Room Called');
        var data = {
            roomToken: token
        };

        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/JoinRoom', {
            data: data,
            type: 'post',
            success: function (response) {
                console.log(response);
                if (response != false) {
                    if (response.ClientRefreshed == "No" || response.ClientRefreshed == "ClientToJoin") {
                        global.userToken = response.participantToken;
                        global.roomToken = token;
                        $('#dvStatus').html('Connected with ' + response.friend);
                        global.FriendName = response.friend;

                        $('#remote-video').hide();
                        $('#reconnectingDiv').show();
                        $('#divChat').hide();
                        if (global.isMobile == true) {
                            $('#client-video').removeClass('mainVideoMobile').addClass('smallVideo');
                        }
                        else {
                            $('#client-video').css('position', 'absolute').css('width', '200px').css('height', '140px').css('top', '625px').css('right', '17px');

                        }
                        RTC.checkRemoteICE();

                        setTimeout(function () {
                            RTC.waitForOffer();
                        }, 3000);
                    }
                    else {
                        alert('Please wait while we re-establish the connection.');
                    }
                }
            }
        });
    },
    waitForParticipant: function () {
        $('#dvStatus').html('Waiting for patient to participate.');

        var data = {
            roomToken: global.roomToken,
            ownerToken: global.userToken
        };
        var theUrl = global.baseUrl;
        $.ajax(theUrl + '/GetParticipant', {
            data: data,
            type: 'post',
            success: function (response) {
                if (response !== false) {
                    global.participant = response.participant;

                    $('#dvStatus').html('Connected with ' + response.participant);
                    global.FriendName = response.participant;

                    $('#remote-video').hide();
                    $('#reconnectingDiv').show();
                    if (global.isMobile == true) {
                        $('#client-video').removeClass('mainVideoMobile').addClass('smallVideo');
                    }
                    else {
                        $('#client-video').css('position', 'absolute').css('width', '200px').css('height', '140px').css('top', '625px').css('right', '17px');

                    }

                    RTC.createOffer();
                } else {
                    //$('footer').html('<img src="WebRTC/images/loader.gif">');
                    setTimeout(Room.waitForParticipant, 3000);
                }
            }
        });
    }
};

var clientVideo = $('#client-video');

function captureCamera() {
    navigator.getUserMedia({ audio: true, video: true },
        function (stream) {

            if (!navigator.mozGetUserMedia) $('#client-video')[0].src = window.URL.createObjectURL(stream);
            else $('#client-video')[0].mozSrcObject = stream;

            global.clientStream = stream;

            $('#client-video')[0].play();
        },
        function () {
            location.reload();
        });
}

function captureAudio() {
    navigator.getUserMedia({ audio: true, video: false },
        function (stream) {

            if (!navigator.mozGetUserMedia) $('#client-video')[0].src = window.URL.createObjectURL(stream);
            else $('#client-video')[0].mozSrcObject = stream;

            global.clientStream = stream;

            $('#client-video')[0].play();
        },
        function () {
            location.reload();
        });
}

if (global.AppoinmentType == 1)
    captureCamera();
else if (global.AppoinmentType == 2)
    captureAudio();

function onSdpError(e) {
    console.error(e);
}
var logit = '1';
function DoLoggin(msg) {
    if (logit == '1') {
        console.log(msg);
    }
}
var htmlparser = new DOMParser();

var notifications = {loaded:0, unread:0};

socket.on("notification", function(jsondata) {
	var data = JSON.parse(jsondata);
	console.log(data)
	/*if (typeof data.recipients != "Array") {
		data.recipients = new Array(data.recipients);
	}*/
	if (document.getElementById("unreadnotificationsnumber") == null) {
		alert("New notification:\n" + jsondata);
	} else {
		if (document.getElementById("unreadnotificationsnumber").innerHTML == "") {
			document.getElementById("unreadnotificationsnumber").innerHTML = "1";
		} else if (parseInt(document.getElementById("unreadnotificationsnumber").innerHTML) >= 9) {
			document.getElementById("unreadnotificationsnumber").innerHTML = "9+";
		} else {
			document.getElementById("unreadnotificationsnumber").innerHTML = parseInt(document.getElementById("unreadnotificationsnumber").innerHTML) + 1;
		}
		notifications.unread++;
		notifications.loaded++;
		document.title = "(" + notifications.unread + ") " + document.title.split(")")[1];
		document.getElementById("unreadnotificationsnumber").style.display = "inline-block";
		document.getElementById("unreadnotificationsnumber").innerHTML = notifications.unread;
		new Sound(location.origin + "/server_data/server_media/notification_sound.mp3").playanddestroy();
		var notificationswindow = document.getElementById("notificationsdiv").children[1];
		var div = htmlparser.parseFromString(`<div class="notification" style="border:solid 1px black; padding:5px;"><span style="float:right; font-size:15px; color:#AAAAAA; font-family:Calibri;">Sent on the ` + new Date().getFullDate(data.dateIssued)[0] + ` at ` + new Date().getFullDate(data.dateIssued)[1] + `</span><br><span style="float:left; font-size:15px; color:#000000; font-family:Calibri;">Sender: ` + data.senderEmail + `</span><br><span style="float:left; font-size:15px; color:#000000; font-family:Calibri;">recipients: ` + data.recipientEmail + `</span><br><div style="padding:10px; max-width:95%; max-height:75px; overflow:auto">` + data.notificationBody + `</div></div>`, "text/html").body.children[0];
		div.onclick = function() {
			openbiggernotificationwindow(new Date(data.creationDate), data.senderEmail, data.recipientEmail, data.notificationTitle, data.notificationBody);
		}
		notificationswindow.insertBefore(div, notificationswindow.firstChild);
	}
});
socket.on("connect", function() {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", "/modifysocketid");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.responseType = "text";
	xhr.send(JSON.stringify({newSocketID:socket.id}));
});
socket.on("disconnect", function() {
	console.log("The socket has disconnected!");
});
/*async function readNotifications(from, to) {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", "/setnotificationsproperty");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.responseType = "json";
	xhr.send(JSON.stringify({maxlinesfromend:Math.abs(from), minlinesfromend:Math.abs(to), newnotificationsdata:{seen:true}}));
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	});
	notifications.unread = Math.max(notifications.unread - Math.abs(from-to), 0);
	document.title = document.title.split(")").splice(1);
	document.getElementById("unreadnotificationsnumber").style.display = "none";
}*/

async function readAllNotifications() {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", "/markAllNotificationsAsRead");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.responseType = "json";
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	});
	notifications.unread = 0;
	if (document.title.split(")").length != 1) {
		document.title = document.title.split(")").splice(1);
	}
	document.getElementById("unreadnotificationsnumber").style.display = "none";
}

function openbiggernotificationwindow(dateIssued, sender, recipient, title, data) {
	var biggernotificationbgdiv = document.createElement("div");
	biggernotificationbgdiv.style = "top:0px; left:0px; width:100%; height:100%; position:absolute; background-color:rgba(0, 0, 0, 0.4);"
	biggernotificationbgdiv.onclick = function(e) {
		if (e.target == biggernotificationbgdiv) {
			biggernotificationbgdiv.remove();
		}
	}

	var biggernotificationdiv = document.createElement("div");
	biggernotificationdiv.style = "top:10%; left:10%; width:80%; height:80%; position:fixed; border:solid 1px black; background-color:rgba(255, 255, 255, 255); z-index:1; padding:5px;"
	biggernotificationbgdiv.appendChild(biggernotificationdiv);

	var close = document.createElement("span");
	close.style = "color:black; background-color:rgba(0, 0, 0, 0); float:right; font-size:30px;"
	close.innerHTML = "&times";
	close.onmouseover = function() {
		close.style.color = "rgba(255, 255, 255, 255)";
		close.style.backgroundColor = "rgba(255, 0, 0, 255)";
	}
	close.onmouseout = function() {
		close.style.color = "rgba(0, 0, 0, 255)";
		close.style.backgroundColor = "rgba(0, 0, 0, 0)";
	}
	close.onclick = function() {
		biggernotificationbgdiv.remove();
	}
	biggernotificationdiv.appendChild(close);

	document.body.appendChild(biggernotificationbgdiv);

	var contentdiv = document.createElement("div");
	biggernotificationdiv.appendChild(contentdiv);

	var datesent = document.createElement("span");
	datesent.style = "display:block; color:#AAAAAA;"
	datesent.innerHTML = "Date sent: " + new Date(dateIssued).getFullDate().join(" at ")
	contentdiv.appendChild(datesent);

	var senderspan = document.createElement("span");
	senderspan.style = "display:block; color:#AAAAAA;"
	senderspan.innerHTML = "Sender: " + sender;
	contentdiv.appendChild(senderspan);

	var recipientSpan = document.createElement("span");
	recipientSpan.style = "display:block; color:#AAAAAA;"
	recipientSpan.innerHTML = "recipient: " + recipient;
	contentdiv.appendChild(recipientSpan);

	var titleDiv = document.createElement("div");
	titleDiv.style = "display:block; color:#000000;";
	titleDiv.innerHTML = "Title: " + title;
	contentdiv.appendChild(titleDiv);

	var content = document.createElement("div");
	content.style = "border:solid 1px black; overflow:auto; width:100%; max-height:90%; height:90%;"
	content.innerHTML = data;
	contentdiv.appendChild(content);
}

async function init() {
	var notificationmodalbg = document.getElementById("notificationsbgdiv");
	var notificationsdiv = document.getElementById("notificationsdiv").children[1];
	var profilemenubg = document.getElementById("profilemenubgdiv");
	window.addEventListener("click", function(e) {
		if (e.target === notificationmodalbg) {
			notificationmodalbg.style.display = "none";
		}/* else if (e.target === profilemenubg) {
			profilemenu.style.display = "none";
		}*/
	});
	profilemenubg.addEventListener("click", function(e) {
		if (e.target === profilemenubg) {
			profilemenubg.style.display = "none";
		}
	});
	var foundallunreadnotifications = false, orderednotifications = [];
	var xhr = new XMLHttpRequest();
	do {
		xhr.open("GET", "/getnotifications?firstnotificationindex=" + document.getElementsByClassName("notification").length + "&numnotifications=" + 10);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.responseType = "json";
		xhr.send();
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
		}).catch(function(err) {
			throw err;
		});
		console.log(xhr.response);
		orderednotifications = xhr.response.data;//.reverse();
		for (let i = 0; i < orderednotifications.length && !foundallunreadnotifications; i++) {
			if (!orderednotifications[i].hasBeenSeen) {
				notifications.unread++;
				let notificationCreationDate = new Date(xhr.response.data[i].creationDate);
				var div = htmlparser.parseFromString(`<div class="notification" style="border:solid 1px black; padding:5px;"><span style="float:right; font-size:15px; color:#AAAAAA; font-family:Calibri;">Sent on the ` + notificationCreationDate.getFullDate()[0] + ` at ` + notificationCreationDate.getFullDate()[1] + `</span><br><span style="float:left; font-size:15px; color:#000000; font-family:Calibri;">Sender: ` + orderednotifications[i].senderEmail + `</span><br><span style="float:left; font-size:15px; color:#000000; font-family:Calibri;">recipient: ` + orderednotifications[i].recipientEmail + `(you)</span><br><div style="padding:10px; max-width:95%; max-height:75px; overflow:auto">` + orderednotifications[i].notificationBody + `</div></div>`, "text/html").body.children[0];
				div.onclick = function() {
					openbiggernotificationwindow(new Date(orderednotifications[i].creationDate), orderednotifications[i].senderEmail, orderednotifications[i].recipientEmail, data[i].notificationTitle, orderednotifications[i].notificationBody);
				}
				notificationsdiv.appendChild(div);
			} else {
				foundallunreadnotifications = true;
			}
			notifications.loaded++;
		}
	} while (!(foundallunreadnotifications || xhr.response.endreached));
	document.title = (function() {if (notifications.unread === 0) {return ""} else {return "(" + notifications.unread + ") ";}})() + document.title.split(")")[document.title.split(")").length-1];
	document.getElementById("unreadnotificationsnumber").innerHTML = (function() {if (notifications.unread === 0) {document.getElementById("unreadnotificationsnumber").style.display = "none"; return "";} else if (notifications.unread > 9) {return "9+";} else {return  notifications.unread}})();
	document.getElementById("unreadnotificationsnumber").style.display = (function() {if (notifications.unread != 0) {return "inline-block";} else {return "none"}})()
}
async function getandshowNotifications(notificationindex, notificationsnumber, parentElement) {
	console.log("Notification data:", notificationindex, notificationsnumber);
	var xhr = new XMLHttpRequest();
	xhr.open("GET", "/getnotifications?firstnotificationindex=" + notificationindex + "&numnotifications=" + notificationsnumber);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.responseType = "json";
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	});
	let data = xhr.response.data;//.reverse();
	notifications.loaded += xhr.response.data.length;
	for (let i = 0; i < notificationsnumber && data[i] != undefined; i++) {
		let creationDate = new Date(data[i].creationDate);
		var elem = htmlparser.parseFromString(`<div class="notification" style="border:solid 1px black; padding:5px;"><span style="float:right; font-size:15px; color:#AAAAAA; font-family:Calibri;">Sent on the ` + creationDate.getFullDate()[0] + ` at ` + creationDate.getFullDate()[1] + `</span><br><span style="float:left; font-size:15px; color:#000000; font-family:Calibri;">Sender: ` + data[i].senderEmail + `</span><br><span style="float:left; font-size:15px; color:#000000; font-family:Calibri;">recipients: ` + data[i].recipientEmail + `</span><br><div style="padding:10px; max-width:95%; max-height:75px; overflow:auto">` + data[i].notificationBody + `</div></div>`, "text/html").body.children[0];
		elem.onclick = function() {
			openbiggernotificationwindow(new Date(data[i].creationDate), data[i].senderEmail, data[i].recipientEmail, data[i].notificationTitle, data[i].notificationBody);
		}
		parentElement.appendChild(elem);
	}
}
async function displayNotifications() {
	document.getElementById("notificationsbgdiv").style.display = "flex";
	await readAllNotifications();
	var notifications = document.getElementById("notificationsdiv").getElementsByClassName("notification").length;
	if (notifications < 10) {
		await getandshowNotifications(notifications, 10 - notifications, document.getElementById("notificationsdiv").children[1]);
	}
}
async function checkAuth() {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", "/checkAuth");
	xhr.responseType = "json";
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	});
	if (xhr.response.authenticated) {
		var email = xhr.response.email;
		xhr.open("POST", "/getuserdata");
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.responseType = "arraybuffer";
		xhr.send(JSON.stringify({fields:["profilepic", "username"], email:email}));
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
		});
		//Decode the formatted data into JSON and an image blob
		let data = multiDataFormatter.decode(new Uint8Array(xhr.response));
		console.log(data);
		data.data = JSON.parse(await (new Blob([data.data]).text()));
		data.profilePic = new Blob([data.profilePic], {type:"image/png"});
		let profilePicURL = URL.createObjectURL(data.profilePic);
		window.addEventListener("beforeUnload", function() {
			URL.revokeObjectURL(profilePicURL);
		});
		let notificationsDiv = htmlparser.parseFromString(`<div>
		<button id = "checknotifications" onclick="displayNotifications()" style="border-radius:15px; display:inline-block;">
			<svg width="20" height="22">
				<path d="M10,20h4c0,1.1-0.9,2-2,2S10,21.1,10,20z M20,17.35V19H4v-1.65l2-1.88v-5.15c0-2.92,1.56-5.22,4-5.98V3.96 c0-1.42,1.49-2.5,2.99-1.76C13.64,2.52,14,3.23,14,3.96l0,0.39c2.44,0.75,4,3.06,4,5.98v5.15L20,17.35z M19,17.77l-2-1.88v-5.47 c0-2.47-1.19-4.36-3.13-5.1c-1.26-0.53-2.64-0.5-3.84,0.03C8.15,6.11,7,7.99,7,10.42v5.47l-2,1.88V18h14V17.77z"></path>
			</svg>
			<span style="background-color:red; width:15px; height:15px; border-radius:15px; vertical-align:top; display:none;" id = "unreadnotificationsnumber"></span>
		</button>
		<span class = "profilepiccontainer">
			<img width="50" height="50" style="border-radius:25px; display:inline-block;" alt="profilepic" src="` + profilePicURL + `">
			<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg">
				<path d="M 5 5 L 15 5 L 10 10 L 5 5 z"></path>
			</svg>
		</span>
		<div id = "profilemenubgdiv" class = "dropdownbgdiv">
			<div id="profilediv" class = "dropdowndiv">
				<div>
					<a class = "dropdownmenuoption" href="/modifyuserdata">Edit profile...</a>
				</div>
				<div>
					<a class = "dropdownmenuoption" href="/deleteaccount">Delete profile...</a>
				</div>
				<div>
					<a class = "dropdownmenuoption" href="/logout">Logout...</a>
				</div>
			</div>
		</div>`, "text/html").body.children[0];
		
		//Make the drop-down list visible whenever the user clicks on the drop-down
		notificationsDiv.getElementsByClassName("profilepiccontainer")[0].addEventListener("click", function(e) {
			document.getElementById("profilemenubgdiv").style.display = "unset";
			let profileDiv = document.getElementById("profilediv");
			profileDiv.style.top = e.currentTarget.offsetTop;
			profileDiv.style.left = e.currentTarget.offsetLeft + e.currentTarget.offsetWidth - 121;
		});
		document.getElementById("accountdetails").appendChild(notificationsDiv);
		if (document.getElementById("greetingscreen") !== null) {
			document.getElementById("greetingscreen").children[0].textContent = "Welcome, " + data.data.username + "!";
		}
/*		xhr.open("GET", "/getnotifications?minlinesfromend=" + document.getElementsByClassName("notification").length + "&maxlinesfromend=" + document.getElementsByClassName("notification").length + 10);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.responseType = "json";
		xhr.send();
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
		});*/
	}
}
async function awaitinitasyncs() {
	await checkAuth();
	await init();
}

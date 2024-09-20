var htmlparser = new DOMParser();

HTMLSanitiser = (function() {
	let disallowedAttributesDefault = ["onsearch", "onappinstalled", "onbeforeinstallprompt", "onbeforexrselect", "onabort", "onbeforeinput", "onbeforematch", "onbeforetoggle", "onblur", "oncancel", "oncanplay", "oncanplaythrough", "onchange", "onclick", "onclose", "oncontentvisibilityautostatechange", "oncontextlost", "oncontextmenu", "oncontextrestored", "oncuechange", "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "onformdata", "oninput", "oninvalid", "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart", "onmousedown", "onmouseenter", "onmouseleave", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel", "onpause", "onplay", "onplaying", "onprogress", "onratechange", "onreset", "onresize", "onscroll", "onsecuritypolicyviolation", "onseeked", "onseeking", "onselect", "onslotchange", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "ontoggle", "onvolumechange", "onwaiting", "onwebkitanimationend", "onwebkitanimationiteration", "onwebkitanimationstart", "onwebkittransitionend", "onwheel", "onauxclick", "ongotpointercapture", "onlostpointercapture", "onpointerdown", "onpointermove", "onpointerrawupdate", "onpointerup", "onpointercancel", "onpointerover", "onpointerout", "onpointerenter", "onpointerleave", "onselectstart", "onselectionchange", "onanimationend", "onanimationiteration", "onanimationstart", "ontransitionrun", "ontransitionstart", "ontransitionend", "ontransitioncancel", "onafterprint", "onbeforeprint", "onbeforeunload", "onhashchange", "onlanguagechange", "onmessage", "onmessageerror", "onoffline", "ononline", "onpagehide", "onpageshow", "onpopstate", "onrejectionhandled", "onstorage", "onunhandledrejection", "onunload", "ondevicemotion", "ondeviceorientation", "ondeviceorientationabsolute", "onpageswap", "onpagereveal", "onscrollend"];
	let disallowedElementsDefault = ["script"];
	return {
		sanitiseAgainstLists(elem, attributes = disallowedAttributesDefault, elements = disallowedElementsDefault, level = 0) {
			//Remove case sensitivity
			if (level === 0) {
				if (attributes !== disallowedAttributesDefault) {
					for (let i = 0; i < attributes.length; i++) {
						attributes[i] = attributes[i].toLowerCase();
					}
				}
				if (elements !== disallowedElementsDefault) {
					for (let i = 0; i < elements.length; i++) {
						elements[i] = elements[i].toLowerCase();
					}
				}
			}
			if (elem.nodeType === Node.TEXT_NODE || elem.nodeType === Node.COMMENT_NODE) {
				//These node types cannot pose any threat, nor can they have child nodes
				return elem;
			}
			//Check whether or not element type is allowed
			if (elements.indexOf(elem.nodeName.toLowerCase()) !== -1) {
				elem.remove();
				return;
			}
			for (let i = 0; i < attributes.length; i++) {
				if (elem.hasAttribute(attributes[i])) {
					elem.removeAttribute(attributes[i])
				}
			}
			let childNodes = elem.children;
			for (let i = 0; i < childNodes.length; i++) {
				this.sanitiseAgainstLists(childNodes[i], attributes, elements, level + 1);
			}
			if (level === 0) {
				return elem;
			}
		},
		sanitiseAccordingToLists(elem, attributes = [], elements = [], level = 0) {
			if (level === 0) {
				for (let i = 0; i < attributes.length; i++) {
					attributes[i] = attributes[i].toLowerCase();
				}
				for (let i = 0; i < elements.length; i++) {
					elements[i] = elements[i].toLowerCase();
				}
			}
			if (elem.nodeType === Node.TEXT_NODE || elem.nodeType === Node.COMMENT_NODE) {
				//These node types cannot pose any threat, nor can they have child nodes
				return elem;
			}
			//Check whether or not element type is allowed
			if (elements.indexOf(elem.nodeName.toLowerCase()) === -1) {
				elem.remove();
				return;
			}
			let elementAttributes = elem.getAttributeNames();
			for (let i = 0; i < elementAttributes.length; i++) {
				if (attributes.indexOf(elementAttributes[i]) === -1) {
					elem.removeAttribute(elementAttributes[i]);
				}
			}
			let childNodes = Array.from(elem.children);
			for (let i = 0; i < childNodes.length; i++) {
				sanitiseAccordingToLists(childNodes[i], attributes, elements, level + 1);
			}
			if (level === 0) {
				return elem;
			}
		}
	}
})();

var notifications = {loaded:0, unread:0};

const notificationHTMLString = `<div class="notification">
	<div class = "notificationheader horizontallySeparatedContent">
		<div>
			<div class = "notificationdata sender"></div>
			<div class = "notificationdata recipient"></div>
		</div>
		<div class = "notificationdate"></div>
	</div>
	<div class = "notificationcontentpeek"></div>
</div>`;

const showDetailedResponseViewFunction = async function(e) {
	//Do this immediately due to the wait caused by the asynchronous request
	e.stopPropagation();
	let res = await fetch(`/fetchDetailedResponse?responseID=${e.currentTarget.getAttribute("detailsid")}`, {
		method: "GET"
	});
	if (res.status !== 200) {
		//Display error
		alert(await res.text());
		return;
	}
	//Response OK. Attempt to parse it as an HTML document
	let detailedResponseDOM = htmlparser.parseFromString(await res.text(), "text/html");
	//Check if the library is available for use
	if (modal) {
		let m = new modal(document.body, "Detailed quiz answers");
		m.setModalWidth(window.innerWidth/2);
		m.setModalHeight(window.innerHeight/2);
		m.setModalLeft(window.innerWidth/4);
		m.setModalTop(window.innerHeight/4);
		m.getModalBody().append(...detailedResponseDOM.body.childNodes);
		m.show();
	}
}

function addDetailedResponseViewListener(elems = []) {
	if (elems.length === 0) {
		//Add this listener to every element of this class type
		var elems = document.getElementsByClassName("moreDetails");
	}
	for (let i = 0; i < elems.length; i++) {
		elems[i].addEventListener("click", showDetailedResponseViewFunction);
	}
}

async function deleteAccount() {
	let data;
	if (typeof modal === "function") {
		let m = new modal(document.body, "Delete your profile - confirmation");
		let content = htmlparser.parseFromString(`
			<div>This is a protected action. For security reasons, the account's password is required. Please enter it below</div>
			<div><input type = "password" class = "password"></div>
			<div><label>Delete all quizzes associated with the account?<input type = "checkbox" class = "deleteAllQuizzes" /></label></div>
			<div><button type = "button" class = "modalsubmissionbutton submitpassword">OK</button><button type = "button" class = "modalsubmissionbutton abortpasswordsubmission">Cancel</button></div>
		`, "text/html").body;
		content = document.adoptNode(content);
		let p = new Promise(function(res, rej) {
			let submitted = false;
			let deleteAllQuizzes = content.getElementsByClassName("deleteAllQuizzes")[0];
			let password = content.getElementsByClassName("password")[0];
			content.getElementsByClassName("submitpassword")[0].addEventListener("click", function(e) {
				if (!submitted) {
					submitted = true;
					if (password.value === "") {
						password.parentElement.style.setProperty("--field-error-value", "'This field cannot be empty'");
						password.parentElement.classList.remove("invalidFieldEntry");
						//Trigger reflow
						document.body.offsetHeight;
						password.parentElement.classList.add("invalidFieldEntry");
						return;
					}
					res({
						password: password.value,
						deleteAllQuizzes: deleteAllQuizzes.checked
					});
					m.destroy();
				}
			});
			content.getElementsByClassName("abortpasswordsubmission")[0].addEventListener("click", function(e) {
				if (!submitted) {
					submitted = true;
					res({
						password: null,
						deleteAllQuizzes: null
					});
					m.destroy();
				}
			});
			let oldHandler = m.getCloseHandler();
			m.setCloseHandler(function() {
				if (!submitted) {
					submitted = true;
					res({
						password: null,
						deleteAllQuizzes: null
					});
				}
				oldHandler();
			});
		});
		m.setModalHeight(300);
		m.setModalWidth(window.innerWidth/2);
		m.setModalLeft(window.innerWidth/4);
		m.getModalBody().append(...content.childNodes);
		m.show();
		data = await p;
	} else {
		data = {};
		data.deleteAllQuizzes = confirm("Would you like to delete all quizzes associated with this account?");
		data.password = prompt("You are attempting to delete the quiz, which is a protected action. For security reasons, the account's password is required. Please enter it below");
	}
	console.log(data)
	//User action aborted; exit
	if (data.password == null) {
		return;
	}
	
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", location.origin + "/deleteaccount");
	xhr.setRequestHeader("Content-Type", "application/json");
	//xhr.responseType = "json";
	xhr.send(JSON.stringify(data));
	try {
		await new Promise(function(res, rej) {
			xhr.onload = function() {
				if (xhr.status === 200) {
					res();
				} else {
					rej(xhr.response);
				}
			};
			xhr.onerror = rej;
		});
		alert("Sucessfully deleted account");
		window.location.href = location.origin;
	} catch (e) {
		alert(e);
	}

}

const notificationQueue = [];
let isNotificationQueueBeingProcessed = false;
socket.on("notification", async function(jsondata) {
	var data = JSON.parse(jsondata);
	console.log(data);
	/*if (typeof data.recipients != "Array") {
		data.recipients = new Array(data.recipients);
	}*/
	if (document.getElementById("unreadnotificationsnumber") == null) {
		notificationQueue.push(JSON.parse(jsondata));
		if (typeof modal === "function" && !isNotificationQueueBeingProcessed) {
			isNotificationQueueBeingProcessed = true;
			while (notificationQueue.length > 0) {
				if (await Notification.requestPermission() === "granted") {
					let n = new Notification(`Quizdom - "${data.notificationTitle}"`, {
						body: data.notificationBody
					});
					await new Promise(function(res, rej) {
						let promiseResWrapper = function() {
							n.removeEventListener("close", promiseResWrapper);
							res();
						}
						n.addEventListener("close", promiseResWrapper);
					});
				} else if (typeof modal === "function") {
					let modal = new modal(document.body, "New notification! " + data.title);
					modal.getModalBody().appendChild(document.adoptNode(htmlparser.parseFromString(`<div>

					</div>`, "text/html").body.children[0]))
				}
			}
			isNotificationQueueBeingProcessed = false;
		}
		//alert("New notification:\n" + );
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

		//Add the number of unseen notifications to the document title
		let titleComponents = document.title.split(")");
		if (titleComponents.length === 1) {
			//No brackets
			document.title = "(" + notifications.unread + ") " + titleComponents[0];
		} else {
			//There are brackets
			document.title = "(" + notifications.unread + ") " + titleComponents[1];
		}
		document.getElementById("unreadnotificationsnumber").style.display = "inline-block";
		document.getElementById("unreadnotificationsnumber").innerHTML = notifications.unread;
		new Sound(location.origin + "/server_data/server_media/notification_sound.mp3").playAndDestroy();
		var notificationswindow = document.getElementById("notificationsdiv").children[1];
		var div = htmlparser.parseFromString(notificationHTMLString, "text/html").body.children[0];
		div.getElementsByClassName("sender")[0].textContent = `Sender: ${data.senderEmail}`;
		div.getElementsByClassName("recipient")[0].textContent = `Recipient(s): ${data.recipientEmail}`;
		div.getElementsByClassName("notificationdate")[0].textContent = `Sent on the ${new Date(data.dateIssued).getFullDate()[0]} at ${new Date(data.dateIssued).getFullDate()[1]}`;
		div.getElementsByClassName("notificationcontentpeek")[0].append(...HTMLSanitiser.sanitiseAgainstLists(htmlparser.parseFromString(data.notificationBody, "text/html").body).childNodes);
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
	if (document.title.split(")").length !== 1) {
		//TODO: Fix the trailing space character which is not removed
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
	//close.style = "color:black; background-color:rgba(0, 0, 0, 0); float:right; font-size:30px;"
	close.innerHTML = "&times";
	close.classList.add("closebutton")
	/*close.onmouseover = function() {
		close.style.color = "rgba(255, 255, 255, 255)";
		close.style.backgroundColor = "rgba(255, 0, 0, 255)";
	}
	close.onmouseout = function() {
		close.style.color = "rgba(0, 0, 0, 255)";
		close.style.backgroundColor = "rgba(0, 0, 0, 0)";
	}*/
	close.addEventListener("click", function() {
		biggernotificationbgdiv.remove()
	});

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

	addDetailedResponseViewListener(content.getElementsByClassName("moreDetails"));

	contentdiv.appendChild(content);
}

async function init() {
	var notificationmodalbg = document.getElementById("notificationsbgdiv");
	var notificationsdiv = document.getElementById("notificationsdiv").children[1];
	var profilemenubg = document.getElementById("profilemenubgdiv");
	window.addEventListener("click", function(e) {
		if (e.target === notificationmodalbg) {
			notificationmodalbg.classList.add("hidden");
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
				var div = htmlparser.parseFromString(notificationHTMLString, "text/html").body.children[0];
				div.getElementsByClassName("sender")[0].textContent = `Sender: ${orderednotifications[i].senderEmail}`;
				div.getElementsByClassName("recipient")[0].textContent = `Recipient(s): ${orderednotifications[i].recipientEmail}`;
				div.getElementsByClassName("notificationdate")[0].textContent = `Sent on the ${notificationCreationDate.getFullDate()[0]} at ${notificationCreationDate.getFullDate()[1]}`;
				div.getElementsByClassName("notificationcontentpeek")[0].append(...HTMLSanitiser.sanitiseAgainstLists(htmlparser.parseFromString(orderednotifications[i].notificationBody, "text/html").body).childNodes);
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
	//TODO: FIX THIS NONSENSE
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

	//These buttons, found in each notification's content will have a special listener added to them: that which loads up a detailed report statement
	let detailedResponseButtons = [];
	for (let i = 0; i < notificationsnumber && data[i] != undefined; i++) {
		let creationDate = new Date(data[i].creationDate);
		var elem = htmlparser.parseFromString(notificationHTMLString, "text/html").body.children[0];
		elem.getElementsByClassName("sender")[0].textContent = `Sender: ${data[i].senderEmail}`;
		elem.getElementsByClassName("recipient")[0].textContent = `Recipient(s): ${data[i].recipientEmail}`;
		elem.getElementsByClassName("notificationdate")[0].textContent = `Sent on the ${creationDate.getFullDate()[0]} at ${creationDate.getFullDate()[1]}`
		elem.getElementsByClassName("notificationcontentpeek")[0].append(...HTMLSanitiser.sanitiseAgainstLists(htmlparser.parseFromString(data[i].notificationBody, "text/html").body).childNodes);

		//Add the elements whose class is moreDetails
		detailedResponseButtons.push(...elem.getElementsByClassName("moreDetails"));
		elem.addEventListener("click", function() {
			openbiggernotificationwindow(new Date(data[i].creationDate), data[i].senderEmail, data[i].recipientEmail, data[i].notificationTitle, data[i].notificationBody);
		});
		parentElement.appendChild(elem);
	}

	//Add the listener to the array of button elements with a special class: "moreDetails"
	console.log(detailedResponseButtons);
	addDetailedResponseViewListener(detailedResponseButtons);
}
async function displayNotifications() {
	document.getElementById("notificationsbgdiv").classList.remove("hidden");
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
		//User is authenticated: fetch own data and hide login and signup buttons
		if (location.pathname === "/") {
			var loginButton = document.getElementById("login");
			var signupButton = document.getElementById("signup");
			loginButton.classList.add("hidden");
			signupButton.classList.add("hidden");
		}

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
		<button class = "checknotifications" style="border-radius:15px; display:inline-block;">
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
					<a class = "dropdownmenuoption deleteaccount">Delete profile...</a>
				</div>
				<div>
					<a class = "dropdownmenuoption logout">Logout...</a>
				</div>
			</div>
		</div>`, "text/html").body.children[0];
		notificationsDiv.getElementsByClassName("deleteaccount")[0].addEventListener("click", deleteAccount);
		notificationsDiv.getElementsByClassName("logout")[0].addEventListener("click", function(e) {
			/*if (modal) {
				let m = new modal(document.body, "Are you sure you want to log out?");
				let body = m.getModalBody();

				m.show();
			} else {

			}*/
			if (confirm("Are you sure you wish to log out?")) {
				logout();
			}
		});
		notificationsDiv.getElementsByClassName("checknotifications")[0].addEventListener("click", displayNotifications);
		
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

async function logout() {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", location.origin + "/logout");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.responseType = "json"
	xhr.send();
	try {
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
		});
		alert("Sucessfully logged out of account");
		window.location.href = location.origin
	} catch (e) {
		alert("Logout failed!")
	}
}

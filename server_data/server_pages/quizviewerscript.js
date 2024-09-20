let allQuizzesFetched = false;
let currentQuizIndex = 0;
let numQuizzes = 5;

var parser = new DOMParser();

const toDisplayDateTime = function(dateObj = new Date()) {
	return `${("0000" + dateObj.getFullYear()).slice(-4)}-${("00" + (dateObj.getMonth() + 1)).slice(-2)}-${("00" + dateObj.getDate()).slice(-2)} ${("00" + (dateObj.getHours())).slice(-2)}:${("00" + (dateObj.getMinutes())).slice(-2)}:${("00" + (dateObj.getSeconds())).slice(-2)}`
}

const addQuizDiv = function(parentElem = document.body, quizData, appendEntryBeforeElem = null) {
	const options = [
		{
			name:"Edit quiz...",
			handler:function() {
				//TODO: Look into this
				qc.value = decodeURIComponent(quizdescriptor.classList[0]);
				//Object.freeze(quizcode);
				window.location.href = `/editquiz?qc=${encodeURIComponent(quizData.quizCode)}&getquestions=1`;
				//editquiz(decodeURIComponent(quizdescriptor.classList[0]));
			}
		},
		{
			name:"Delete quiz...",
			handler:function() {
				deletequiz(decodeURIComponent(this.classList[0]));
			}
		}
	];
		
	let quizdescriptor = document.createElement("div");
	quizdescriptor.classList.add(encodeURIComponent(quizData.quizCode));
	quizdescriptor.classList.add("quizdescriptor");
	quizdescriptor.onclick = function(e) {
		//Background div to check when to hide drop down menu
		var bgdiv = document.createElement("div");
		bgdiv.classList.add("dropdownbg");
		var opts = document.createElement("div");
		opts.classList.add("optsdropdowncontainer");
		opts.style = "top:" + e.pageY + "px; left:" + e.pageX + "px;";
		for (let i = 0; i < options.length; i++) {
			var optioncontainer = document.createElement("div");
			//Insert options into the dropdown menus
			optioncontainer.textContent = options[i].name;
			optioncontainer.addEventListener("click", options[i].handler.bind(quizdescriptor));
			optioncontainer.classList.add("dropdownlistoption");
			opts.appendChild(optioncontainer);
		}
		bgdiv.appendChild(opts);
		bgdiv.onclick = function(e) {
			if (e.target === bgdiv) {
				bgdiv.remove();
			}
		}
		document.body.appendChild(bgdiv);
	}

	//Create the div containing the quiz title
	let quizTitle = document.createElement("span");
	quizTitle.classList.add("quiztitle");

	let quizTitleDOM = HTMLSanitiser.sanitiseAccordingToLists(parser.parseFromString(quizData.quizTitle, "text/html").body, ["class", "name", "style"], ["body", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "cite", "blockquote", "b", "i", "u", "str", "abbr", "code", "em", "sub", "sup"]);
	quizTitle.append(...quizTitleDOM.childNodes);
	//Do this here to reduce the number of reflows by adding in a single element with children already added, which only triggers a single reflow as opposed to adding the children after having added the parent to the visible DOM, causing multiple reflows
	quizdescriptor.appendChild(quizTitle);

	//Display the quiz's code
	let quizCode = document.createElement("div");
	quizCode.classList.add("quizCode");
	quizCode.textContent = "Quiz code: " + quizData.quizCode;
	quizdescriptor.appendChild(quizCode);

	//Display the number of questions presented by the quiz
	let numQuestions = document.createElement("div");
	numQuestions.classList.add("numQuestions");
	numQuestions.textContent = quizData.numQuestions + " questions";
	quizdescriptor.appendChild(numQuestions);

	//Display the quiz's creation date
	let quizCreationDate = document.createElement("div");
	quizCreationDate.classList.add("quizCreated", "dateDisplay");
	quizCreationDate.textContent = "Quiz created on the " + toDisplayDateTime(new Date(quizData.dateCreated));
	quizdescriptor.appendChild(quizCreationDate);

	//quizdescriptor.innerHTML = `<span>Quiz title: ` + quizData.quiztitle + `</span><br /><span>Quiz code: ` + quizData.quizcode + `</span><br />`;
	if (appendEntryBeforeElem == null) {
		parentElem.appendChild(quizdescriptor);
	} else {
		parentElem.insertBefore(quizdescriptor, appendEntryBeforeElem);
	}
}

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

const qc = {};
var user = {};

async function viewQuizzes(elem = document.body) {
	//Get the page element

	var xhr = new XMLHttpRequest();
	xhr.open("GET", "/checkAuth");
	xhr.responseType = "json";
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	});
	if (xhr.response.authenticated) {
		user.authenticated = xhr.response.authenticated;
		user.email = xhr.response.email;
		Object.freeze(user);

		//Prepare the page title's background, with class headerTextContainer
		let headerTextContainer = document.createElement("div");
		headerTextContainer.classList.add("headerTextContainer");

		//Display the page's title
		let header = document.createElement("span");
		header.classList.add("headerText");
		header.textContent = "Check out your quizzes!";
		headerTextContainer.appendChild(header);

		elem.appendChild(headerTextContainer);

		var frame = document.createElement("div");
		//TODO: Check this
		frame.setAttribute("id", "quizzesframe");
		frame.classList.add("quizzesframe");

		let bottomDiv = document.createElement("div");
		frame.appendChild(bottomDiv);

		const observer = new IntersectionObserver(async function(entries, observer) {
			//Attempt to fetch more quizzes
			if (!allQuizzesFetched) {
				xhr.open("GET", `/getOwnQuizzes?firstQuizIndex=${currentQuizIndex}&numQuizzes=${numQuizzes}`);
				xhr.responseType = "json";
				xhr.send();
				await new Promise(function(res, rej) {
					xhr.onload = res;
					xhr.onerror = rej;
				});
				currentQuizIndex += numQuizzes;
				var quizzes = xhr.response.data;
				console.log(xhr.response);
				allQuizzesFetched ||= xhr.response.ready;
				for (let i = 0; i < quizzes.length; i++) {
					//Iterate over the retrieved quiz data and turn each quiz into its own row, always before the bottom div
					addQuizDiv(frame, quizzes[i], bottomDiv);
				}
			}
		}, {
			root: frame,
			rootMargin: "0px",
			threshold: 1.0
		});
		observer.observe(bottomDiv);

		elem.appendChild(frame);
		
		//Trigger reflow before adding new class
		document.body.offsetHeight;
		headerTextContainer.addEventListener("transitionend", function(e) {
			header.classList.add("visible");
		}, {once: true});
		headerTextContainer.classList.add("visible");

		//elem.parentElement.parentElement.remove();
		xhr.open("GET", `/getOwnQuizzes?firstQuizIndex=${currentQuizIndex}&numQuizzes=${numQuizzes}`);
		xhr.responseType = "json";
		xhr.send();
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
		});
		currentQuizIndex += numQuizzes;
		var quizzes = xhr.response.data;
		console.log(xhr.response);
		allQuizzesFetched ||= xhr.response.ready;
		do {
			for (let i = 0; i < quizzes.length; i++) {
				//Iterate over the retrieved quiz data and turn each quiz into its own row
				addQuizDiv(frame, quizzes[i], bottomDiv);
			}
			//Do this once and continue to do so until the frame becomes scrollable. This invariably and inevitably causes a couple of reflows, unfortunately...
		} while (frame.scrollHeight < frame.clientHeight);
	} else {
		alert("You need to be signed in to your account to view your quizzes!");
		window.location.href = window.location.origin;
	}
}

/*async function editquiz(qc) {
	var htmlparser = new DOMParser();
	var xhr = new XMLHttpRequest();
	xhr.open("GET", location.origin + "/getquizdata?qc=" + encodeURIComponent(qc) + "&socketStreamQuestions=1");
	xhr.responseType = "json";
	xhr.send();
	var quizMetadata = await new Promise(function(res, rej) {
		xhr.onload = function() {
			if (xhr.status !== 200) {
				rej("XHR failed: status " + xhr.status);
			} else {
				res(xhr.response);
			}
		};
		xhr.onerror = rej;
	}).catch(function() {
		if (xhr.response != null) {
			//if the catch promise is called, the xhr response cannot be null unless something went wrong with transferring the error
			alert(xhr.response.error);
		} else {
			alert("Failed to obtain quiz data to edit. (Error code: " + xhr.status + ")");
		}
		throw "XHRError: Failed to obtain quiz data to edit. XHR status: " + xhr.status;
	});
	xhr.open("GET", location.origin + "/server_data/server_templates/quizeditingpage.html");
	xhr.responseType = "document";
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	}).catch(function() {
		alert("Failed to load page. (Error code: " + xhr.status + ")");
		throw "XHRError: Failed to load page. XHR status: " + xhr.status;
	});
	var quizdom = xhr.response;
	quizdom.getElementById("quiztitle").value = quizMetadata.quiztitle;
	quizdom.getElementById("bgmusic").checked = quizMetadata.bgmusic;
	quizdom.getElementById("bgmusic").dispatchEvent(new Event("change"));
	quizdom.getElementById("bgmusicsrc").value = quizMetadata.bgmusicsrc;
	quizdom.getElementById("dotimelimit").checked = quizMetadata.dotimelimit;
	quizdom.getElementById("dotimelimit").dispatchEvent(new Event("change"));
	quizdom.getElementById("doanswerbuzzers").checked = quizMetadata.answerbuzzers;
	quizdom.getElementById("doanswerbuzzers").dispatchEvent(new Event("change"));
	quizdom.getElementById("correctanswersrc").value = quizMetadata.correctanswerbuzzersrc;
	quizdom.getElementById("incorrectanswersrc").value = quizMetadata.incorrectanswerbuzzersrc;
	quizdom.getElementById("showcorrectanswers").checked = quizMetadata.showcorrectanswers;
	quizdom.getElementById("showcorrectanswers").dispatchEvent(new Event("change"));
	quizdom.getElementById("sendquizanswers").checked = quizMetadata.sendAnswers;
	quizdom.getElementById("sendquizanswers").dispatchEvent(new Event("change"));
	quizdom.getElementById("quizanswersrecipientemail").value = quizMetadata.answersrecipient;
	quizdom.getElementById("showgrade").checked = quizMetadata.showgrade;
	quizdom.getElementById("showgrade").dispatchEvent(new Event("change"));
	quizdom.getElementById("showgradecomment").checked = quizMetadata.showgradecomment;
	var comments = quizMetadata.resulthtmlcommentranges;
	for (let i = 0; i < comments.length; i++) {
		var gradeRange = htmlparser.parseFromString(`<fieldset class = "gradeRange"><legend>Grade range</legend><span>Minimum Grade</span><input type = "number" class = "rangecomponent"></input><button style = "float:right; background-color:white; color:black;" onclick = "this.parentElement.remove()" onmouseover = "this.style.color = 'white'; this.style.backgroundColor = 'red'" onmouseout = "this.style.color = 'black'; this.style.backgroundColor = 'white'" class = "rangecomponent">&times;</button><br /><span>Maximum Grade</span><input type = "number" class = "rangecomponent"></input><br /><div style = "border:solid 1px black;" class = "editablerangecomponent" contenteditable>Enter your comment here:</div></fieldset>`, "text/html");
		gradeRange.getElementsByClassName("rangecomponent")[0].value = comments[i].min;
		gradeRange.getElementsByClassName("rangecomponent")[2].value = comments[i].max;
		gradeRange.getElementsByClassName("editablerangecomponent")[0].innerHTML = comments[i].comment;
		quizdom.getElementById("graderanges").appendChild(gradeRange.body.children[0]);
	}
	quizdom.getElementById("showpoints").checked = quizMetadata.showpoints;
	quizdom.getElementById("showpoints").dispatchEvent(new Event("change"));
	quizdom.getElementById("quizagerestriction").value = quizMetadata.agerestriction;
	quizdom.getElementById("privatequiz").checked = quizMetadata.quiztitle;
	quizdom.getElementById("privatequiz").dispatchEvent(new Event("change"));
	quizdom.getElementById("allowedquizparticipants").value = quizMetadata.allowedparticipants.join("\n");
	quizdom.getElementById("quiztitle").value = quizMetadata.quiztitle;
	//Needs fixing
	var socketIterator = {
		//IIFE (Immediately Invoked Function Expression) to return a function with access to a hidden scope - CLOSURE FUNCTION
		next: (function() {
			var done = false;
			socket.on("streamended", function(data) {
				done = true
			});
			return async function() {
				return {done, value:await new Promise(function(res, rej) {
					let removeHandlers = function() {
						socket.removeListener(successHandler);
						socket.removeListener(failureHandler);
					}
					let successHandler = function(data) {
						removeHandlers();
						res(data);
					}
					let failureHandler = function(err) {
						removeHandlers();
						rej(err);
					}
					socket.on("stream", successHandler);
					socket.on("streamfailed", failureHandler);
				})};
			}
		})(),
		//Syntactic sugar for Symbol.asyncIterator as key with a function value (o[Symbol.asyncIterator] = function(...args) {...})
		[Symbol.asyncIterator]() {
			return this;
		}
	}
	socket.emit("startstream");
	for await (var question of socketIterator) {
		socket.emit("streamreceived");
	}
	Array.prototype.slice.call(quizdom.getElementById("quizset").getElementsByClassName("questionbit")).map(function(elem) {elem.remove(); return null;})
	for (let i = 0; i < quizMetadata.numQuestions; i++) {
		//TODO: REMOVE ALL THIS!
		var questionelem = htmlparser.parseFromString(`<fieldset class="questionbit" style="display:inline;"><legend>Question ` + (i + 1) + `</legend><span style="float: right; background-color: rgba(0, 0, 0, 0); color: rgb(0, 0, 0); font-size: 30px;" onmouseover="this.style.color = 'rgba(255, 255, 255, 255)'; this.style.backgroundColor = 'rgba(255, 0, 0, 255)';" onmouseout="this.style.color = 'rgba(0, 0, 0, 255)'; this.style.backgroundColor = 'rgba(0, 0, 0, 0)';" onclick="if (document.getElementsByClassName('questionbit').length > 1) {this.parentElement.setAttribute('class', 'null'); var questions = document.getElementsByClassName('questionbit'); for (let i = 0; i < questions.length; i++) {questions[i].querySelector('legend').innerHTML = 'Question ' + (i + 1)} 	document.querySelector('#questionsinquiz').innerHTML = 'Number of questions in the quiz: ' + document.querySelector('#quizset').querySelectorAll('.questionbit').length; this.parentElement.remove();} else {alert('You must have at least 1 question');}">&times;</span><input type="text" class="questionliteral" placeholder="Enter the question here"><br><br><div style="border:solid 1px black;"><p style="display:inline;">Question type:</p><select class="questiontype" onchange="var qtypediv = this.parentElement.getElementsByClassName('choices')[0]; for (let i = 0; i < qtypediv.children.length; i++) {qtypediv.children[i].style.display = 'none'}; qtypediv.querySelector('#' + this.value).style.display = 'inline-block'"><option value="multichoice">Multi-Choice Question</option><option value="textchoice">Text Question</option></select><br><div class="choices"><div style="display: none;" id="textchoice"><span>Enter correct answer here:&nbsp;</span><input type="text" id="correctanswer"><br><input type="checkbox" class="iscasesensitive">Case-sensitive?</div><div style="display: inline-block;" id="multichoice"><button onclick="var options = addnewquizoption(this.parentElement); this.parentElement.querySelector('#numofopts').innerHTML = 'Number of options: ' + options.length">Add option...</button><br><span id="numofopts">Number of options: 2</span><br><br><button class="option"><span style="display:inline-block; min-width:50px; min-height:15px;" contenteditable="">Enter text here</span><span style="float: right; background-color: rgba(0, 0, 0, 0); color: rgb(0, 0, 0);" onmouseover="this.style.color = 'rgba(255, 255, 255, 255)'; this.style.backgroundColor = 'rgba(255, 0, 0, 255)';" onmouseout="this.style.color = 'rgba(0, 0, 0, 255)'; this.style.backgroundColor = 'rgba(0, 0, 0, 0)';" onclick="elem = this; if (this.parentElement.parentElement.getElementsByClassName('option').length > 2) {this.parentElement.parentElement.querySelector('#numofopts').innerHTML = 'Number of options: ' + (this.parentElement.parentElement.querySelectorAll('.option').length - 1); this.parentElement.remove()} else {alert('You must have at least two options!')}">&times;</span><br><input type="checkbox">Correct answer?</button><button class="option"><span style="display:inline-block; min-width:50px; min-height:15px;" contenteditable="">Enter text here</span><span style="float: right; background-color: rgba(0, 0, 0, 0); color: rgb(0, 0, 0);" onmouseover="this.style.color = 'rgba(255, 255, 255, 255)'; this.style.backgroundColor = 'rgba(255, 0, 0, 255)';" onmouseout="this.style.color = 'rgba(0, 0, 0, 255)'; this.style.backgroundColor = 'rgba(0, 0, 0, 0)';" onclick="elem = this; if (this.parentElement.parentElement.getElementsByClassName('option').length > 2) {this.parentElement.parentElement.querySelector('#numofopts').innerHTML = 'Number of options: ' + (this.parentElement.parentElement.querySelectorAll('.option').length - 1); this.parentElement.remove()} else {alert('You must have at least two options!')}">&times;</span><br><input type="checkbox">Correct answer?</button></div></div></div><div id="correctanswermessage"><span>Correct answer message:&nbsp;</span><span style="border:solid 1px black; display:inline-block; min-width:50px; min-height:15px;" contenteditable="" id="msg"></span></div><div id="incorrectanswermessage"><span>Incorrect answer message:&nbsp;</span><span style="border:solid 1px black; display:inline-block; min-width:50px; min-height:15px;" contenteditable="" id="msg"></span></div><div id="messageduration"><span>Correct/incorrect answer message duration (seconds):&nbsp;</span><input id="tlimit" type="number" min="0" value="10"></div><div id="questionduration"><span>Question time limit (seconds):&nbsp;</span><input id="tlimit" type="number" min="0" value="10"></div><div id="maxpointsachievable"><span>Max points achievable in question:&nbsp;</span><input id="maxpoints" type="number" min="0" value="1000"></div></fieldset>`, "text/html");
		questionelem.getElementsByClassName("questionliteral")[0].value = quizdata.questions[i].question;
		if (questions[i].questionType === "multichoice") {
			Array.prototype.slice.call(questionelem.getElementsByClassName("option")).map(function(elem) {elem.remove(); return null;})
			for (let j = 0; j < questions[i].options.length; j++) {
				var optionelem = htmlparser.parseFromString(`<button class="option"><span style="display:inline-block; min-width:50px; min-height:15px;" contenteditable="">Enter text here</span><span style="float: right; background-color: rgba(0, 0, 0, 0); color: rgb(0, 0, 0);" onmouseover="this.style.color = 'rgba(255, 255, 255, 255)'; this.style.backgroundColor = 'rgba(255, 0, 0, 255)';" onmouseout="this.style.color = 'rgba(0, 0, 0, 255)'; this.style.backgroundColor = 'rgba(0, 0, 0, 0)';" onclick="elem = this; if (this.parentElement.parentElement.getElementsByClassName('option').length > 2) {this.parentElement.parentElement.querySelector('#numofopts').innerHTML = 'Number of options: ' + (this.parentElement.parentElement.querySelectorAll('.option').length - 1); this.parentElement.remove()} else {alert('You must have at least two options!')}">&times;</span><br><input type="checkbox">Correct answer?</button>`, "text/html");
				optionelem.body.children[0].children[0].innerHTML = questions[i].options[j];
				optionelem.getElementsByTagName("input")[0].checked = questions[i].answers.indexOf(questions[i].options[j]) != -1;
				questionelem.getElementById("multichoice").appendChild(optionelem.body.children[0]);
			}
			questionelem.getElementById("numofopts").innerHTML = "Number of options: " + questionelem.getElementsByClassName("option").length;
		} else {
			questionelem.getElementById("correctanswer").value = questions[i].answers.join(", ");
			questionelem.getElementsByClassName("iscasesensitive")[0].checked = questions[i].caseSensitive;
		}
		questionelem.getElementsByClassName("questiontype")[0].value = questions[i].questionType;
		questionelem.getElementsByClassName("questiontype")[0].dispatchEvent(new Event("change"));
		questionelem.getElementById("correctanswermessage").children[1].innerHTML = quizdata.questions[i].correctanswermessage;
		questionelem.getElementById("incorrectanswermessage").children[1].innerHTML = quizdata.questions[i].incorrectanswermessage;
		questionelem.getElementById("questionduration").children[1].value = quizdata.questions[i].timelimit/1000;
		questionelem.getElementById("messageduration").children[1].value = quizdata.questions[i].messageduration/1000;
		questionelem.getElementById("maxpoints").value = quizdata.questions[i].maxpointsperquestion;
		quizdom.getElementById("quizset").appendChild(questionelem.body.children[0]);
	}
	quizdom.getElementById("questionsinquiz").innerHTML = "Number of questions in the quiz: " + quizdom.getElementsByClassName("questionbit").length
	document.head.replaceWith(quizdom.head);
	document.body.replaceWith(quizdom.body);
}*/

async function deletequiz(qc) {
	let pwd;
	if (typeof modal === "function") {
		let m = new modal(document.body, `Delete quiz of code "${qc}" - confirmation`);
		let content = parser.parseFromString(`
			<div>This is a protected action. For security reasons, the account's password is required. Please enter it below</div>
			<div><input type = "password" class = "password"></div>
			<div><button type = "button" class = "modalsubmissionbutton submitpassword">OK</button><button type = "button" class = "modalsubmissionbutton abortpasswordsubmission">Cancel</button></div>
		`, "text/html").body;
		content = document.adoptNode(content);
		let p = new Promise(function(res, rej) {
			let submitted = false;
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
					res(password.value);
					m.destroy();
				}
			});
			content.getElementsByClassName("abortpasswordsubmission")[0].addEventListener("click", function(e) {
				if (!submitted) {
					submitted = true;
					res(null);
					m.destroy();
				}
			});
			let oldHandler = m.getCloseHandler();
			m.setCloseHandler(function() {
				if (!submitted) {
					submitted = true;
					res(null);
				}
				oldHandler();
			});
		});
		m.getModalBody().append(...content.childNodes);
		m.show();
		pwd = await p;
	} else {
		pwd = prompt("You are attempting to delete the quiz, which is a protected action. For security reasons, the account's password is required. Please enter it below");
	}
	console.log(pwd)
	//User action aborted; exit
	if (pwd == null) {
		return;
	}
	
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", `${location.origin}/deletequiz?qc=${encodeURIComponent(qc)}&pwd=${encodeURIComponent(pwd)}`);
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = function() {
			if (xhr.status === 200) {
				res();
			} else {
				rej();
			}
		};
		xhr.onerror = rej;
	}).then(function() {
		if (xhr.status === 200) {
			document.getElementById("quizzesframe").getElementsByClassName(encodeURIComponent(qc))[0].remove();
			alert("Quiz successfully deleted");
		} else {
			throw new Error("Uncaught XHRError: XMLHttpRequest Failed (Status code " + xhr.status + ")");
		}
	}).catch(function() {
		if (xhr.response != null) {
			alert(xhr.response);
		} else {
			alert("Failed to delete quiz. (Error code: " + xhr.status + ")")
		}
		throw new Error("XHRError: Failed to delete quiz. XHR status: " + xhr.status + ". Error message: \"" + xhr.response + "\"");
	});
}
async function savechanges(newquizJSON, quizcode) {
	quizcode = encodeURIComponent(quizcode);
	var xhr = new XMLHttpRequest();
	xhr.open("POST", location.origin + "/modifyexistingquiz?qc=" + qc.value, true);
	xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	xhr.responseType = "json";
	xhr.send(newquizJSON);
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = rej;
	}).catch(function() {
		try {
			alert("Failed to create quiz: " + xhr.response.error);
		} catch (e) {
			alert("Failed to create quiz. (Error " + xhr.status + ")");
		}
		throw "QuizCreationError: Failed to create quiz. XHR Status:" + xhr.status;
	});
	alert("Quiz successfully modified!");
}

//viewQuizzes(this);
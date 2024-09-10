//Mechanism to retrieve the current quiz code and prevent people from changing it. If it were change, it would not affect other clients, for the server has its own safety mechanisms to handle improper client-side quiz code modifications
let getQuizCode;

var parser = new DOMParser();
let svgTick = parser.parseFromString(`<svg viewbox = "0 0 200 200" class = "answerSVG" width = "200" height = "200" xmlns="http://www.w3.org/2000/svg">
	<path d = "M 0 150 L 50 200 C 50 125 125 0 200 0" fill="none" stroke="green" stroke-width = "10" stroke-linecap="round" />
</svg>`, "image/svg+xml").documentElement;
let svgCross = parser.parseFromString(`<svg viewbox = "0 0 200 200" class = "answerSVG" width = "200" height = "200" xmlns="http://www.w3.org/2000/svg">
	<path d = "M 0 0 L 200 200 M 200 0 L 0 200" fill="none" stroke="red" stroke-width = "10" stroke-linecap="round" />
</svg>`, "image/svg+xml").documentElement;

let peekAtQuizTemplate = parser.parseFromString(`<div class = "page">
	<div class = "propertygroup"><span>You are about to join quiz&nbsp;</span><span class = "quizname"></span></div>
	<div class = "personDescriptionDiv">
		<div class = "propertygroup"><span>This quiz has &nbsp;<span class = "numquizquestions"></span>&nbsp;question(s)</span></div>
		<div class = "propertygroup"><span>It was created by&nbsp;</span><span class = "quizcreatorusername"></span></div>
		<div class = "propertygroup"><img alt = "Quiz creator profile picture" class = "quizcreatorprofilepic mediumprofilepic" /></div>
		<div class = "propertygroup"><span>Any concerns or enquiries regarding this quiz should be mailed to&nbsp;</span><span class = "quizcreatoremail"></span></div>
		<!--<div class = "propertygroup"><a class = "visitprofilepage">Click here to visit the creator's profile page</a></div>-->
	</div>
	<div class = "quizattributesdiv">
		<div class = "propertygroup"><span>Hereunder, you shall find all this quiz's attributes. Please examine them lightly before joining this quiz</span></div>
		<textarea class = "quizattributes"></textarea>
	</div>
	<button class = "joinquiz">Join the quiz!</button>
</div>`, "text/html");

function setListeners() {
	document.getElementById("submit").addEventListener("click", function(e) {
		peekAtQuiz(document.getElementById("quizcode").value);
	});
	document.getElementById("quizcode").addEventListener("keypress", function(e) {
		if (e.key === "Enter") {
			peekAtQuiz(document.getElementById("quizcode").value);
		}
	});
}
//Function to join a particular quiz using a quiz code
async function peekAtQuiz(quizCode) {
	let res = await fetch(`/getquizdata?qc=${encodeURIComponent(quizCode)}`, {
		method:"GET"
	});

	if (res.status !== 200) {
		//Something went wrong! Get the message and display it to the user!
		alert(await res.text());
		return;
	}

	let peekObj;
	try {
		peekObj = await res.json();
	} catch (e) {
		alert("Failed to parse quiz metadata!");
		return;
	}

	//Make all the DOM changes before appending the branch to the visible DOM, in order to reduce the number of reflows
	peekAtQuizTemplate.getElementsByClassName("quizname")[0].textContent = `"${peekObj.quizData.quizTitle}"`;
	peekAtQuizTemplate.getElementsByClassName("numquizquestions")[0].textContent = peekObj.quizData.numQuestions;
	peekAtQuizTemplate.getElementsByClassName("quizcreatorusername")[0].textContent = `"${peekObj.creatorData.userName}"`;
	peekAtQuizTemplate.getElementsByClassName("quizcreatorprofilepic")[0].src = "/server_data/" + peekObj.creatorData.profilePic; //TODO: Complete URI
	peekAtQuizTemplate.getElementsByClassName("quizcreatoremail")[0].textContent = peekObj.creatorData.emailAddress;
	//peekAtQuizTemplate.getElementsByClassName("visitprofilepage")[0].href = ""; //TODO: Implement page functionality

	peekAtQuizTemplate.getElementsByClassName("joinquiz")[0].addEventListener("click", function(e) {
		joinquiz(quizCode);
	})

	let propertiesField = peekAtQuizTemplate.getElementsByClassName("quizAttributes")[0];

	peekAtQuizTemplate.getElementsByClassName("quizcreatoremail")[0].textContent = peekObj.creatorData.emailAddress;

	//Prevent the field from being modified whilst allowing people to traverse it with a visible caret
	let acceptableKeys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
	let func = function(e) {
		if (!(e.key.toLowerCase() === "a" && e.ctrlKey) && acceptableKeys.indexOf(e.key) === -1) {
			e.preventDefault();
			e.stopPropagation();
		}
	}
	propertiesField.addEventListener("keydown", func, {capture:true});
	propertiesField.addEventListener("keyup", func, {capture:true});
	propertiesField.addEventListener("keypress", func, {capture:true});

	//This metadata won't be used again (a new copy will be requested from the server), so modifying it won't make that much of a difference
	if (peekObj.quizData.ageRestriction === 0) {
		peekObj.quizData.ageRestriction = "NONE";
	}
	if (peekObj.quizData.sendAnswers) {
		peekObj.quizData.sendAnswers = "YES";
	} else {
		peekObj.quizData.sendAnswers = "NO";
	}

	if (peekObj.quizData.backgroundMusicSrc == null) {
		peekObj.quizData.backgroundMusicSrc = "NONE"
	}

	if (peekObj.quizData.doAnswerBuzzers) {
		peekObj.quizData.doAnswerBuzzers = "YES";
		if (peekObj.quizData.correctAnswerBuzzerSrc == null) {
			peekObj.quizData.correctAnswerBuzzerSrc = "NONE";
		}
		if (peekObj.quizData.incorrectAnswerBuzzerSrc == null) {
			peekObj.quizData.incorrectAnswerBuzzerSrc = "NONE";
		}
	} else {
		peekObj.quizData.doAnswerBuzzers = "NO";
		peekObj.quizData.correctAnswerBuzzerSrc = "NONE";
		peekObj.quizData.incorrectAnswerBuzzerSrc = "NONE";
	}

	if (peekObj.quizData.doTimeLimit) {
		peekObj.quizData.doTimeLimit = "YES";
	} else {
		peekObj.quizData.doTimeLimit = "NO";
	}

	if (peekObj.quizData.privateQuiz) {
		peekObj.quizData.privateQuiz = "YES";
	} else {
		peekObj.quizData.privateQuiz = "NO";
	}

	if (peekObj.quizData.showCorrectAnswers) {
		peekObj.quizData.showCorrectAnswers = "YES";
	} else {
		peekObj.quizData.showCorrectAnswers = "NO";
	}

	if (peekObj.quizData.showPoints) {
		peekObj.quizData.showPoints = "YES";
	} else {
		peekObj.quizData.showPoints = "NO";
	}

	if (peekObj.quizData.showGrade) {
		peekObj.quizData.showGrade = "YES";
	} else {
		peekObj.quizData.showGrade = "NO";
	}

	if (peekObj.quizData.showGradeComment) {
		peekObj.quizData.showGradeComment = "YES";
	} else {
		peekObj.quizData.showGradeComment = "NO";
	}

	let propertiesStr = `Minimum age to join quiz: ${peekObj.quizData.ageRestriction}
Number of questions: ${peekObj.quizData.numQuestions}
Will your answers be sent? ${peekObj.quizData.sendAnswers}
If so, to which address? ${peekObj.quizData.answersRecipient}
Will there be a time limit? ${peekObj.quizData.doTimeLimit}
Background music URL: ${peekObj.quizData.backgroundMusicSrc}
Answer buzzers? ${peekObj.quizData.doAnswerBuzzers}
Correct answer buzzer URI: ${peekObj.quizData.correctAnswerBuzzerSrc}
Incorrect answer buzzer URI: ${peekObj.quizData.incorrectAnswerBuzzerSrc}
Is this quiz private? ${peekObj.quizData.privateQuiz}
Will correct answers be shown? ${peekObj.quizData.showCorrectAnswers}
Will points be involved? ${peekObj.quizData.showPoints}
Will your grade be shown? ${peekObj.quizData.showGrade}
Will a comment based on your grade be shown? ${peekObj.quizData.showGradeComment}`
	
	//Set the text field's value
	propertiesField.value = propertiesStr;

	//DO NOT clone the node, due to the event listeners attached to the text field, which would not carry over to its copy
	let newBody = document.adoptNode(peekAtQuizTemplate.body);
	document.body.remove();
	document.documentElement.appendChild(newBody);

}

async function joinquiz(quizCode) {
	//Create an inner scope (closure) which cannot be accessed externally except through the function returned by the IIFE (Immediately-Invoked-Function-Expression), which serves as a getter method, rendering the now finalised quiz code read-only
	quizCodeObject = (function() {
		let qcClosure = quizCode;
		return function() {
			return qcClosure;
		}
	})();
	//let xhr = new XMLHttpRequest();
	//Using the new FETCH API!
	//Attempt to fetch quiz metadata first (before the template page) to check whether the user can join the quiz
	
	let res = await fetch(`/joinquiz?qc=${encodeURIComponent(quizCode)}`, {
		method:"POST",
		credentials: "include"
	});
	let quizMetadata, resType = res.headers.get("Content-Type");
	if (res.status !== 200) {
		//Something went wrong! Get the message and display it to the user!
		alert(await res.text());
		return;
	}
	//Response ok! Response MIME type will be application/json! Parse the JSON to get an object
	try {
		quizMetadata = await res.json();
	} catch (e) {
		alert("Failed to parse quiz metadata!");
		return;
	}

	console.log(quizMetadata);
	//Get quiz creator's attributes


	//Good! We can now fetch the quiz page, load it in and fetch quiz data through sockets!
	let quizPage = await fetch("/server_data/server_pages/htmlquiztemplates/Quiz_Template.html", {
		method:"GET"
	});
	let parser = new DOMParser();
	let pageDOM = parser.parseFromString(await quizPage.text(), "text/html");
	let newMainDocumentElement = document.adoptNode(pageDOM.documentElement);
	let scripts = document.getElementsByTagName("script");
	for (let i = 0; i < scripts.length;) {
		scripts[i].remove();
	}
	document.documentElement.remove();
	//Insert new document
	document.append(newMainDocumentElement);

	try {
		await performQuiz(quizMetadata);
	} catch (e) {
		console.log(e);
	}
}

//HTML documents passed into these functions should have been produced by DOMParser.parseFromString method, scripts and events produced by which do not execute
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

//Function to produce CSS colour from array of RGBA values without changing the array
function generateCSSColour(rgbArr) {
	switch (rgbArr.length) {
		case 3:
			return `rgb(${Math.min(255, Math.max(0, rgbArr[0]))}, ${Math.min(255, Math.max(0, rgbArr[1]))}, ${Math.min(255, Math.max(0, rgbArr[2]))})`;
		case 4:
			return `rgba(${Math.min(255, Math.max(0, rgbArr[0]))}, ${Math.min(255, Math.max(0, rgbArr[1]))}, ${Math.min(255, Math.max(0, rgbArr[2]))}, ${Math.min(255, Math.max(0, rgbArr[3]))})`;
		default:
			//Error case
			return `rgb(0, 0, 0)`;
	}
}

function animateAnswerPaddle(elem, correct) {
	let rect = elem.getBoundingClientRect();
	let bodyRect = document.body.getBoundingClientRect();
	let axisXPos = rect.x + rect.width/2 - bodyRect.width/2;
	//Use trigonometry (and conversion from radians to degrees) to obtain the angle from the opposite (1000px Z-axis perspective) divided by the adjacent (x-axis position)
	let perpendicularToObserverAngle = 180 - (Math.atan(1000/axisXPos) * (180/Math.PI));
	//Safety in case of NaN
	if (Number.isNaN(perpendicularToObserverAngle)) {
		perpendicularToObserverAngle = 0;
	}
	//Specify animation key frames
	let animationKeyFrames = [
		{transform:"rotate3d(0, 1, 0, 0deg)"},
		{transform:`rotate3d(0, 1, 0, ${180-perpendicularToObserverAngle}deg)`}
	];
	//Ensure that the value's absolute never exceeds 180 (Max is 360, due to atan)
	if (perpendicularToObserverAngle > 180) {
		perpendicularToObserverAngle = perpendicularToObserverAngle - 360;
	}
	//Specify animation key options
	let animationOptions = {
		duration:1000 * Math.abs(perpendicularToObserverAngle/180),
		iterations:1,
		fill:'forwards'
	};
	return new Promise(function(res, rej) {
		//Specify the animation data
		//Start the animation and set its completion callback to the promise success callback. More code will be executed in the then function
		let animation = elem.animate(animationKeyFrames, animationOptions);
		animation.onfinish = res;
	}).then(function(value) {
		if (correct) {
			//Correct answer! Turn this paddle green!
			elem.style.backgroundColor = "#00FF00";
		} else if (correct === false) { /*Must account for the possibility of undefined. !undefined yields true*/
			//Incorrect answer! Turn this paddle green!
			elem.style.backgroundColor = "#FF0000";
		} else {
			//Undefined veracity; we do not know whether this option in particular is correct or not
			elem.style.backgroundColor = "#6677FF";
		}
		return new Promise(function(res, rej) {
			//Specify new animation key frames
			let animationKeyFrames = [
				{transform:`rotate3d(0, 1, 0, ${180+perpendicularToObserverAngle}deg)`}
			];
			if (perpendicularToObserverAngle < 0) {
				animationKeyFrames.push({transform:`rotate3d(0, 1, 0, 0deg)`});
			} else {
				animationKeyFrames.push({transform:`rotate3d(0, 1, 0, 360deg)`});
			}
			animationOptions.duration = Math.abs(1000 - animationOptions.duration);
			let animation = elem.animate(animationKeyFrames, animationOptions);
			animation.onfinish = res;
			//setTimeout(res, 2000);
		});
	});
}

async function animateTextAnswer(elem, correct, answersDiv) {
	let keyFrames = [
		{transform: "rotate3d(1, 0, 0, 0deg) scale(100%)"},
		{transform: "rotate3d(1, 0, 0, 80deg) scale(100%)"},
		{transform:"rotate3d(1, 0, 0, 80deg) translate3d(0, -5000px, 0)"}
	];
	let options = {
		duration:500,
		iterations:1,
		fill:'forwards'
	};
	for (let i = 0; i < keyFrames.length - 1; i++) {
		let animation = elem.animate([keyFrames[i], keyFrames[i + 1]], options);
		await animation.finished;
	}
	if (answersDiv != undefined) {
		elem.appendChild(answersDiv);
	}
	keyFrames.reverse();
	//Obtain the textarea element within the provided main element
	let textArea = elem.querySelector("textarea");
	if (correct) {
		//Correct answer!
		textArea.style.backgroundColor = "rgba(0, 255, 0, 0.5)";
		textArea.style.color = "#FFFFFF"
	} else {
		//Incorrect answer!
		textArea.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
		textArea.style.color = "#000000"
	}
	for (let i = 0; i < keyFrames.length - 1; i++) {
		let animation = elem.animate([keyFrames[i], keyFrames[i + 1]], options);
		await animation.finished;
	}
}

function numSubstrInstances(str, substr) {
	let index = -1, numInstances = 0;
	while (true) {
		index = str.indexOf(substr, index + 1);
		if (index === -1) {
			break;
		}
		numInstances++;
	}
	return numInstances;
}

async function performQuiz(quizMetadata) {
	//Get quiz animation stylesheet
	let styleSheetLink = document.createElement("link");
	styleSheetLink.rel = "stylesheet";
	styleSheetLink.href = "/server_data/server_pages/htmlquiztemplates/quizStyles.css";
	let p = new Promise(function(res, rej) {
		styleSheetLink.onload = res;
		styleSheetLink.onerror = rej;
	});
	document.head.appendChild(styleSheetLink);
	await p;

	let latestPromise = createSocketResponsePromise("initiateCountdown"), question, response;
	socket.emit("ready");
	await latestPromise;
	//Utilise block scoping to automatically delete block-scoped variables (references to DOMElements) in order to make them eligible for garbage collection
	{
		//Implement 4-second countdown (3, 2, 1, GO!)
		let flexDiv = document.createElement("div");
		flexDiv.classList.add("animationPositioningdiv")
		let pulseDiv = document.createElement("div");
		pulseDiv.classList.add("animatedCountdownPulse");
		flexDiv.appendChild(pulseDiv);
	
		let numberSpan = document.createElement("span");
		numberSpan.classList.add("animatedStartNumber");
		flexDiv.appendChild(numberSpan);
	
		document.body.appendChild(flexDiv);
	
		//Display the numbers
		for (let i = 3; i > -1; i--) {
			let p = Promise.all([
				new Promise(function(res, rej) {
					numberSpan.addEventListener("animationend", res, {once: true});
				}),
				new Promise(function(res, rej) {
					pulseDiv.addEventListener("animationend", res, {once: true});
				})
			]);
			//Refresh animation
			numberSpan.classList.remove("animatedStartNumber");
			//Trigger a reflow
			numberSpan.offsetWidth;
			numberSpan.classList.add("animatedStartNumber");
			//Refresh pulse
			pulseDiv.classList.remove("animatedCountdownPulse");
			//Trigger a reflow
			pulseDiv.offsetWidth;
			pulseDiv.classList.add("animatedCountdownPulse");
			if (i === 0) {
				//Display GO!
				numberSpan.innerText = "GO!";
				numberSpan.classList.add("go");
			} else {
				//Display a number
				numberSpan.innerText = i;
			}
			await p;
		}
	
		//Done with flexDiv; remove it to make it eligible for gc
		flexDiv.remove();
	}

	let questionDiv = document.getElementById("questionDiv");
	let answersDiv = document.getElementById("answersDiv");
	let quizTitle = document.getElementById("quizTitle");
	let questionsRatio = document.getElementById("questionsRatio");


	let timerElem;
	if (quizMetadata.doTimeLimit == 1) {
		//There is a time limit
		timerElem = document.createElement("progress");
		timerElem.min = 0;
		timerElem.max = 100;		
		timerElem.classList.add("progressBar");
		document.getElementById("quizDiv").insertBefore(timerElem, document.getElementById("quizDiv").firstChild);
	}

	let parser = new DOMParser();
	
	//To be supplied with appropriate function with which to deliver answer.
	let deliverAnswer;
	
	//Resolved whenever the deliverAnswer function is invoked. Is regenerated on every question
	let answerSourcePromise;

	//Allow formatted, sanitised titles
	let titleBodyElem = HTMLSanitiser.sanitiseAccordingToLists(parser.parseFromString(quizMetadata.quizTitle, "text/html").body, ["class", "name", "style"], ["body", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "cite", "blockquote", "b", "i", "u", "str", "abbr", "code", "em", "sub", "sup"]);
	for (let node of titleBodyElem.childNodes) {
		quizTitle.append(node);
	}
	let backgroundMusic;
	if (quizMetadata.backgroundMusicSrc != null) {
		backgroundMusic = new Sound(quizMetadata.backgroundMusicSrc);
		//Play this nackground music in a loop
		await backgroundMusic.play(true);
	}
	let i;
	for (i = 0; i < quizMetadata.numQuestions; i++) {
		//This is to signify timers to stop and is declared within the scope of every for loop to ensure that each iterator gets its own state
		let answerHasBeenDelivered = false;
		questionsRatio.textContent = `Question ${i + 1} of ${quizMetadata.numQuestions}`;
		latestPromise = createSocketResponsePromise("question");
		//Done for readability (safe alternative would have been dragging a whole iteration outside the loop)
		if (i === 0) {
			socket.emit("countdownReady");
		} else {
			socket.emit("readyQuestion");
		}
		question = await latestPromise;

		let questionSpan = document.createElement("span");
		questionSpan.style.color = "white";
		questionSpan.classList.add("question");

		//Store the question's body's sanitised children
		let elems = [];
		let questionHTML = parser.parseFromString(question.questionHTMLSanitised, "text/html");
		for (let i = 0; i < questionHTML.body.childNodes.length; i++) {
			//This includes text and comment nodes
			elems.push(HTMLSanitiser.sanitiseAgainstLists(questionHTML.body.childNodes[i]));
			document.adoptNode(questionHTML.body.childNodes[i]);
		}
		questionSpan.append(...elems);
		questionDiv.appendChild(questionSpan);

		let options = JSON.parse(question.optionsJSON);

		//Ask question by question
		console.log(question);
		//Store the option div elements
		let optionElems = [];
		//Declare this variable here to make it accessible to the animation function
		let textField, responseContentDiv;
		if (question.questionType === "multichoice") {
			//Multiple-choice question

			//Function to deliver the answer. Always available, but varies, depending on the type of question (i.e.: multiple-choice or text)
			answerSourcePromise = new Promise(function(res, rej) {
				let hasBeenResolved = false;
				deliverAnswer = function(answer = "") {
					if (!hasBeenResolved) {
						//This function will ALWAYS be invoked before this promise resolves; it is the only way it will resolve
						for (let elem of optionElems) {
							//Remove their animations by removing their listeners and classes
							elem.removeEventListener("pointerdown", commonMouseDownHandler);
							elem.classList.remove("responsive");
						}
						socket.emit("answer", answer);
						res();
						hasBeenResolved = true;
						answerHasBeenDelivered = true;
						return true;
					} else {
						return false;
					}
				};
			});

			let commonClickHandler;
			commonClickHandler = function(e) {
				deliverAnswer(e.currentTarget.innerHTML);
			}
			let commonMouseDownHandler = function(e) {
				let quizOption = e.currentTarget;
				//Animate the element shrinking
				let options = { 
					duration:200,
					iterations:1,
					easing:'ease-out',
					fill:'forwards'
				}, keyframes = [
					{transform:"scale(100%)"},
					{transform:"scale(85%)"}
				];
				//Wherever the cursor is lifted, the animation will still be performed, only once (on the first mouseup event following the mousedown on this particular element)
				window.addEventListener("pointerup", function(newE) {
					quizOption.animate(keyframes.reverse(), options);
				}, {once: true});
				quizOption.animate(keyframes, options);
			}
			console.log(options);
			for (let i = 0; i < options.length; i++) {
				optionElems.push(document.createElement("div"));

				//Make the option divs' button characteristics and purpose obvious to accessibility tools and features
				optionElems[i].role = "button";
				//Add the "answerOption" and "responsive" classes to the div, in order to give it appropriate styling
				optionElems[i].classList.add("answerOption");
				optionElems[i].classList.add("responsive");

				//Sanitise the body from malignant HTML event handlers and scripts
				let sanitisedBody = HTMLSanitiser.sanitiseAgainstLists(parser.parseFromString(options[i], "text/html").body);
				for (let node of sanitisedBody.childNodes) {
					optionElems[i].append(node);
				}
				optionElems[i].addEventListener("click", commonClickHandler);
				optionElems[i].addEventListener("pointerdown", commonMouseDownHandler);
				let rgbArr = [Math.floor(Math.random() * 255),
					Math.floor(Math.random() * 255),
					Math.floor(Math.random() * 255)
				];
				optionElems[i].style.backgroundColor = generateCSSColour(rgbArr);
				if (rgbArr[0]*0.299 + rgbArr[1]*0.587 + rgbArr[2]*0.114 > 186) {
					//Black mode!
					optionElems[i].style.color = "rgb(0, 0, 0)";
				} else {
					//White mode!
					optionElems[i].style.color = "rgb(255, 255, 255)";
				}

				//At the end, append this node to the parent div containing all the choices (answers)
				answersDiv.appendChild(optionElems[i]);
			}
		} else if (question.questionType === "textchoice") {
			//Text field: no answer options

			answerSourcePromise = new Promise(function(res, rej) {
				let hasBeenResolved = false;
				deliverAnswer = function(answer) {
					if (!hasBeenResolved) {
						//TODO: If need be, add more things here
						socket.emit("answer", answer);
						res();
						hasBeenResolved = true;
						answerHasBeenDelivered = true;
						return true;
					} else {
						return false;
					}
				}
			})
			//Create text field to allow the users to input their answer
			responseContentDiv = document.createElement("div");
			responseContentDiv.classList.add("textOptionAnswerDiv");
			answersDiv.appendChild(responseContentDiv);

			textField = document.createElement("textarea");
			//Prevent people from crashing their own browsers by filling the text field
			textField.maxLength = 5000;
			textField.classList.add("answerTextField");
			textField.placeholder = "Enter your response here..."
			textField.addEventListener("keypress", function(e) {
				if (e.key === "Enter" && !e.shiftKey) {
					console.log("Enter key pressed!");
					//Equivalent to pressing submit button
					e.stopPropagation();
					e.preventDefault();
					deliverAnswer(textField.value);
				}
			});
			responseContentDiv.appendChild(textField);

			let submit = document.createElement("div");
			//Make this div's role as a button obvious to accessibility tools and features
			submit.role = "button";
			submit.classList.add("submitButton");
			//Deliver the answer on submit button click
			submit.addEventListener("click", function() {
				deliverAnswer(textField.value);
			});
			let submitChild = document.createElement("div");
			submitChild.textContent = "Submit your answer!";
			submit.appendChild(submitChild);
			responseContentDiv.appendChild(submit);
		}

		//This would be sent by the server, following the client's response or (in case involving time limits) a lack of a response after a given period
		latestPromise = createSocketResponsePromise("correctAnswer");

		if (quizMetadata.doTimeLimit == 1) {
			//Hackers: this can be bypassed, but don't bother! The server is always one step ahead of you! Introducing: SERVER-SIDE TIMERS!!!
			//If the time runs out (if this quiz has a time limit, this would submit an empty answer to the server)
			//Get the start (current) time as a reference
			let now = Date.now();
			while (now + question.timeLimit > Date.now() && !answerHasBeenDelivered) {
				await new Promise(function(res, rej) {
					setTimeout(res, 50);
					timerElem.value = (now + question.timeLimit - Date.now())/question.timeLimit * 100;
				});
			}
			if (!answerHasBeenDelivered) {
				timerElem.value = 0;
				if (question.questionType === "textchoice") {
					//Deliver the text within the textbox
					deliverAnswer(textField.value);
				} else {
					deliverAnswer("");
				}
				new Sound("/server_data/server_static_resources/time_up.mp3").playAndDestroy();
			}
		}

		await answerSourcePromise;

		//Possibly perform a waiting animation here

		let response = await latestPromise;
		if (typeof response === "string") {
			response = JSON.parse(response);
		} else if (typeof response === "object" & response.errorCode === "timeoutExceeded") {
			//Server has not provided the answer within a reasonable timespan... AAARRRRGGGGHHHH
			console.log(response);
		}
		//Display the answers
		let promise;
		if (question.questionType === "multichoice") {
			//Create an array of promises to await
			let promArr = [];
			//Iterate through the answer options
			for (let option of optionElems) {
				//console.log(elems);
				//Check whether this answer option was correct. No need to check for case sensitivity
				if (quizMetadata.showCorrectAnswers) {
					if (response.correctAnswers.indexOf(option.innerHTML) === -1) {
						//Incorrect answer
						promArr.push(animateAnswerPaddle(option, false));
					} else {
						//Correct answer
						promArr.push(animateAnswerPaddle(option, true));
					}
				} else {
						//Answer's veracity not known
						promArr.push(animateAnswerPaddle(option));
				}
			}
			//Multiple 1-second-long animations taking place concurrently
			await Promise.all(promArr);

			//3-second wait
			promise = new Promise(function(res, rej) {
				setTimeout(res, 3000);
			});
		} else if (question.questionType === "textchoice") {
			//TODO: Animate this here
			//Initialise elements and state for animation
			let correctOptionsDiv;
			if (quizMetadata.showCorrectAnswers) {
				correctOptionsDiv = document.createElement("div");
				//div element to store the correct answers
				let correctOptionsDivLabel = document.createElement("div");
				correctOptionsDiv.appendChild(correctOptionsDivLabel);
				if (response.correctAnswers.length === 1) {
					correctOptionsDiv.textContent = "Correct option:";
				} else {
					correctOptionsDiv.textContent = "Correct options:";
				}
				//Create sub-divs to store correct answers
				for (var correctAnswer of response.correctAnswers) {
					let correctAnswerDiv = document.createElement("div");
					correctAnswerDiv.innerText = correctAnswer;
					correctOptionsDiv.appendChild(correctAnswerDiv);
				}
			}
			//2-second animation
			await animateTextAnswer(responseContentDiv, response.correct, correctOptionsDiv);
			//2 second wait
			promise = new Promise(function(res, rej) {
				setTimeout(res, 2000);
				//setTimeout(res, Math.sqrt(numSubstrInstances(correctOptionsDiv.innerText, " ") + 1) * 500);
			});
		}
		//4 second wait total for either multiple-choice option or text option

		//Check if the user-provided answer is correct or incorrect and if allowed, play the appropriate sound
		let answerBuzzer, hasSoundBeenPlayed = false;
		if (quizMetadata.doAnswerBuzzers) {
			if (response.correct && quizMetadata.correctAnswerBuzzerSrc != null) {
				answerBuzzer = new Sound(quizMetadata.correctAnswerBuzzerSrc);
				hasSoundBeenPlayed = true;
			} else if (quizMetadata.incorrectAnswerBuzzerSrc != null) {
				answerBuzzer = new Sound(quizMetadata.incorrectAnswerBuzzerSrc);
				hasSoundBeenPlayed = true;
			}
			if (hasSoundBeenPlayed) {
				await answerBuzzer.play();
			}
		}

		//Await the promise to display answer animations
		await promise;

		//If the audio drags on too long, end the player by destroying it here
		if (hasSoundBeenPlayed) {
			answerBuzzer.destroy();
		}

		console.log("Ready!", response);

		//Destroy question's elements after completion. Note that childNodes refers to a live NodeList, whose size (and consequently index-element mappings) dynamically change as elements are removed. Therefore, special iterators should be used to remove the child elements
		while (questionDiv.childNodes.length > 0) {
			questionDiv.childNodes[0].remove();
		}
		while (answersDiv.childNodes.length > 0) {
			answersDiv.childNodes[0].remove();
		}


		let answerCommentDiv = document.createElement("div");
		answerCommentDiv.classList.add("postQuestionRemark");
		if (response.correct) {
			//Correct answer!
			answerCommentDiv.style.backgroundColor = "#00FF00";
		} else {
			//Incorrect answer!
			answerCommentDiv.style.backgroundColor = "#FF0000";
		}

		//TODO: Give the answerCommentDiv its content BEFORE it is added to the visible document to reduce the number of reflows attributed to DOM manipulation
		let answerPointsDiv = document.createElement("div");
		answerPointsDiv.classList.add("answerSlider");
		console.log(response)
		if (response.correct) {
			//Correct answer!
			answerPointsDiv.style.backgroundColor = "#009F00";
			//Involve a deep copy of the node in order not to tamper with the official node
			answerPointsDiv.appendChild(svgTick.cloneNode(true));
		} else {
			//Incorrect answer!
			answerPointsDiv.style.backgroundColor = "#9F0000";
			//Involve a deep copy of the node in order not to tamper with the official node
			answerPointsDiv.appendChild(svgCross.cloneNode(true));
		}
		
		//Span to store and show the updating of the user's points at this point in the quiz
		let pointsSpan, pointsRise, pointsDisplayDiv;
		if (quizMetadata.showPoints) {
			//This is to ensure that the points display is inline with the possible point incrementation transition
			let pointsDisplayDiv = document.createElement("div");
			answerPointsDiv.appendChild(pointsDisplayDiv)

			pointsSpan = document.createElement("span");
			pointsSpan.classList.add("content");
			pointsSpan.textContent = "Points: " + (response.points - response.pointsGained);
			pointsDisplayDiv.appendChild(pointsSpan);
			if (response.correct) {
				//If the answer is correct, show the point incrementation
				pointsRise = document.createElement("span");
				pointsRise.classList.add("newPointsSpan");
				pointsRise.textContent = `+${response.pointsGained}pts`;
				pointsDisplayDiv.appendChild(pointsRise);
			}
		}

		//div element to store the sanitised HTML content of the (in)correct answer message
		let answerMessageDiv = document.createElement("div");
		answerMessageDiv.classList.add("mediumContent");
		let body;
		if (response.correct) {
			body = HTMLSanitiser.sanitiseAgainstLists(parser.parseFromString(question.correctAnswerMessageHTMLSanitised, "text/html").body);
		} else {
			body = HTMLSanitiser.sanitiseAgainstLists(parser.parseFromString(question.incorrectAnswerMessageHTMLSanitised, "text/html").body);
		}
		while (body.childNodes.length > 0) {
			let node = body.childNodes[0];
			document.adoptNode(node);
			answerMessageDiv.appendChild(node);
		}
		answerPointsDiv.appendChild(answerMessageDiv);

		//Append this div to the parent; begin to form a little DOM branch before it is added to the main DOM tree
		answerCommentDiv.appendChild(answerPointsDiv);

		document.body.appendChild(answerCommentDiv);

		//Trigger reflow to ensure that element is loaded before modifying class, which may cause the reflow to be triggered afterwards (after the class has been set), skipping the animation due to the class change not being observed
		document.body.offsetHeight;

		//This is to pull up the answer div, which must always happen
		latestPromise = new Promise(function(res, rej) {
			answerCommentDiv.addEventListener("transitionend", res, {once: true});
		});
		//Set the necessary classes to trigger transitions
		answerCommentDiv.classList.add("transition");
		//1-second transition
		await latestPromise;

		//document.body.offsetHeight;
		//Trigger reflow AFTER the sliding frame becomes fully visible
		if (response.correct && quizMetadata.showPoints) {
			//The answer will pop up here, just with or without animations, depending on whether or not question.messageDuration equals (or exceeds) 1300ms
			if (question.messageDuration >= 1300) {
				pointsRise.classList.add("visibleState");
				//Wait 500ms after 500ms transition completion plus another 500ms for a scaling animation
				await new Promise(function(res, rej) {
					pointsRise.addEventListener("transitionend", function(e) {
						setTimeout(res, 500);
					}, {once: true});
				}).then(async function() {
					//Animation to expand number whilst increasing
					let keyFrames = [
						{transform:"scale(100%)"},
						{transform:"scale(125%)"}
					];
					let properties = {
						iterations:1,
						duration:150,
						fill:'forwards'
					};
					await pointsSpan.animate(keyFrames, properties).finished;
					pointsSpan.textContent = `Points:${response.points}`;
					await pointsSpan.animate(keyFrames.reverse(), properties).finished;
					pointsRise.remove();
				});
				//TODO: Wait as long as the question's messageDuration attribute requires, both client-side and server-side. Possibly remove animation if wait is too short
				await new Promise(function(res, rej) {
					//1300 milliseconds have already been elapsed
					setTimeout(res, question.messageDuration - 1300);
				});
			} else {
				await new Promise(function(res, rej) {
					//Wait question.messageDuration milliseconds in two halves, in between which the change in points will be made visible, without animations
					setTimeout(res, question.messageDuration/2);
				});
				pointsSpan.textContent = `Points:${response.points}`;
				await new Promise(function(res, rej) {
					//1300 milliseconds have already been elapsed
					setTimeout(res, question.messageDuration/2);
				});
			}
		} else {
			await new Promise(function(res, rej) {
				setTimeout(res, question.messageDuration);
			});
		}
		//question.messageDuration-millisecond wait, either way

		//Keep the message on screen for the question.messageDuration milliseconds


		//Reverse transition
		latestPromise = new Promise(function(res, rej) {
			answerCommentDiv.addEventListener("transitionend", res, {once: true});
		});
		answerCommentDiv.classList.remove("transition");
		//Wait for the 1-second transition to finish before removing the element
		await latestPromise;

		answerCommentDiv.remove();
		//5-second wait

		//questionSpan.remove();
		/*switch (question.questionType) {
			case "multichoice":
				for (var elem of optionElems) {
					elem.remove();
				}
				break;
			case "textchoice":
				break;
		}*/
	}
	if (i === quizMetadata.numQuestions) {

		//Done!
		if (quizMetadata.backgroundMusicSrc != null) {
			backgroundMusic.destroy();
		}

		let readyDiv = document.createElement("div");
		readyDiv.classList.add("quizReady");

		let readySpan = document.createElement("span");
		readySpan.textContent = "DONE!";
		readySpan.classList.add("quizReady");
		//do not append this to the main div (readyDiv) just yet
		
		document.body.appendChild(readyDiv);
		document.body.offsetHeight;
		readyDiv.classList.add("transitionPhase1");
		await new Promise(function(res, rej) {
			readyDiv.addEventListener("transitionend", res, {once:true});
		});
        let keyFrames = [
			{transform: "scale(0%)"},
			{transform: "scale(150%) rotate(760deg)"},
			{transform: "scale(100%) rotate(720deg)"},
		];
		let animationProperties = {
			duration:800,
			iterations:1,
			easing:'ease-out',
			fill:'forwards'
		};
		//Make the span a child of the div now (i.e.: make it visible)
		readyDiv.appendChild(readySpan);
		await readySpan.animate([keyFrames[0], keyFrames[1]], animationProperties).finished;
		animationProperties.duration = 200;
		animationProperties.easing = "ease-in";
		await readySpan.animate([keyFrames[1], keyFrames[2]], animationProperties).finished;
		
		await new Promise(function(res, rej) {
			setTimeout(res, 2000);
		});

		readyDiv.classList.remove("transitionPhase1");
		readyDiv.classList.add("transitionPhase2");
		document.body.offsetHeight;
		await new Promise(function(res, rej) {
			readyDiv.addEventListener("transitionend", res, {once:true});
		});

		//Request quiz progress and statistics
		latestPromise = createSocketResponsePromise("quizResults", 5000);
		socket.emit("readyResponse");
		let response = await latestPromise;
		//Short-circuit 'and' to prevent treating a primitive (especially undefined or null) as an object if the first condition does not hold true
		if (typeof response === "object" & response.errorCode === "timeoutExceeded") {
			//Timeout!
		} else {
			//Declare that the results have been received
			socket.emit("resultsReceived", true);
			//Convert it into an object
			response = JSON.parse(response);
		}
		//Log the response object
		console.log(response);

		//Display the results by ordering them into divs
		let resultsBGDiv = document.createElement("div");
		resultsBGDiv.classList.add("resultsContainerBG");

		let resultsDiv = document.createElement("div");
		resultsDiv.classList.add("resultsContainer");
		resultsBGDiv.appendChild(resultsDiv);
		
		if (quizMetadata.showGrade) {
			//Worry not. If the quiz creator did not wish to reveal the grades, the server would have filled in the grade mapping with a hardcoded '0'. These client-side checks are merely for aesthetic (UI) and UX
			let gradeSpan = document.createElement("span");
			gradeSpan.classList.add("smallDarkContent");
			gradeSpan.classList.add("dark");
			gradeSpan.textContent = `You got ${response.grade}/${quizMetadata.numQuestions} (${response.grade/quizMetadata.numQuestions}%)`;
			resultsDiv.appendChild(gradeSpan);

			//Display the grade comment, if applicable
			if (quizMetadata.showGradeComment) {
				let gradeCommentSpan = document.createElement("span");
				gradeCommentSpan.classList.add("smallContent");
				gradeCommentSpan.classList.add("dark");
				gradeCommentSpan.textContent = `Quiz creator's comment:`;
				resultsDiv.appendChild(gradeCommentSpan);
				let gradeCommentDiv = document.createElement("div");
				let gradeCommentBodyElem = HTMLSanitiser.sanitiseAccordingToLists(parser.parseFromString(response.gradeComment, "text/html").body, ["class", "name", "style"], ["body", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "cite", "blockquote", "b", "i", "u", "str", "abbr", "code", "em", "sub", "sup"]);
				let fullOfWhiteSpace = true;
				for (let node of gradeCommentBodyElem.childNodes) {
					//Check for an element node or a text node whose value consists of at least one non-whitespace character
					if (node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE & /[^\s]+/.test(node.nodeValue))) {
						fullOfWhiteSpace = false;
					}
					gradeCommentDiv.append(node);
				}
				if (fullOfWhiteSpace) {
					let noCommentIndicator = document.createElement("span")
					noCommentIndicator.classList.add("styledIndicator");
					noCommentIndicator.textContent = "None";
					gradeCommentDiv.append(noCommentIndicator);
				}
				if (gradeCommentBodyElem.childNodes.length === 0) {

				} else {
				}
				resultsDiv.appendChild(gradeCommentDiv);
			}

			//Allow people to view a detailed report containing their results
			let button = document.createElement("button");
			button.textContent = "View a detailed answer report...";
			if (!(quizMetadata.showCorrectAnswers && response.isLoggedIn)) {
				//Cannot view the answers
				let modalVisible = false;
				button.disabled = true;
				button.addEventListener("pointerover", function(e) {
					if (!modalVisible) {
						let warningPopup = document.createElement("div");
						//Define width and height
						warningPopup.style.left = (e.clientX - 10) + "px";
						warningPopup.style.top = (e.clientY + 10) + "px";

						warningPopup.classList.add("warningPopup");
						if (!(quizMetadata.showCorrectAnswers || response.isLoggedIn)) {
							//Correct answers disabled by quiz creator and not logged in
							warningPopup.textContent = "You cannot access this feature because you are not logged in and it has been disabled by the quiz creator.";
						} else if (!quizMetadata.showCorrectAnswers) {
							//Correct answers disabled by quiz creator
							warningPopup.textContent = "You cannot access this feature because it has been disabled by the quiz creator.";
						} else if (!response.isLoggedIn) {
							//Not logged in
							warningPopup.textContent = "You cannot access this feature because you are not logged in.";
						}
	
						button.appendChild(warningPopup);
						modalVisible = true;
						//Trigger a reflow to register the element as having been added into the document before the class addition
						document.body.offsetHeight;
						warningPopup.classList.add("visibleState");
						warningPopup.addEventListener("pointerout", function() {
							warningPopup.classList.remove("visibleState");
							warningPopup.addEventListener("transitionend", function() {
								warningPopup.remove();
								modalVisible = false;
							}, {once: true});
						});
					}
				});
			}
			resultsDiv.appendChild(button);

		}

		//Show points, if permitted by the quiz creator
		if (quizMetadata.showPoints) {
			let pointsSpan = document.createElement("span");
			pointsSpan.classList.add("smallContent");
			pointsSpan.classList.add("dark");
			pointsSpan.textContent = `You have earned ${response.points} points!`;
			resultsDiv.appendChild(pointsSpan);
		}

		//Link to return to main page
		let homeReturn = document.createElement("a");
		homeReturn.href = location.origin;
		homeReturn.textContent = "Return to home page!";
		resultsDiv.appendChild(homeReturn);

		
		document.body.appendChild(resultsBGDiv);
	}
}

//function to wait for a particular socket message within a given interval
function createSocketResponsePromise(message, timeout = -1) {
	return new Promise(function(res, rej) {
		let successHandler = function(data) {
			destroyHandlers();
			res(data);
		};
		let failureHandler = function(err) {
			destroyHandlers();
			rej(err);
		}
		let timeoutID;
		if (timeout !== -1) {
			timeoutID = setTimeout(successHandler, timeout, {errorCode: "timeoutExceeded", error:"The socket timeout has been exceeded"});
		}
		const destroyHandlers = function() {
			socket.removeListener(message, successHandler);
			socket.removeListener("disconnect", failureHandler);
			socket.removeListener("error", failureHandler);
			if (timeout !== -1) {
				clearTimeout(timeoutID);
			}
		};
		//DO NOT use socket.once. Only one will be called. When that happens, ALL the listeners bound here will have to be destroyed
		socket.on(message, successHandler);
		socket.on("disconnect", failureHandler);
		socket.on("error", failureHandler);
	});
}
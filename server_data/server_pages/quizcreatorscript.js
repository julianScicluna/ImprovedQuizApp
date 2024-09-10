var newgraderangehtmlstring = `<fieldset class = "gradeRange">
	<legend>Grade range</legend>
	<span>Minimum Grade</span>
	<input type = "number" class = "rangecomponent mingrade"></input>
	<button style = "float:right; background-color:white; color:black;" onclick = "this.parentElement.remove()" onmouseover = "this.style.color = 'white'; this.style.backgroundColor = 'red'" onmouseout = "this.style.color = 'black'; this.style.backgroundColor = 'white'" class = "rangecomponent">&times;</button><br />
	<span>Maximum Grade</span>
	<input type = "number" class = "rangecomponent maxgrade"></input>
	<div style = "border:solid 1px black;" class = "editablerangecomponent gradecomment" contenteditable>Enter your comment here:</div>
</fieldset>`;
var newoptionhtmlstring = `<button class="option">
	<div>
		<span class = "content optioncontent" contenteditable=""></span>
		<span class = "deleteoption closebutton">×</span>
	</div>
	<input type="checkbox" class = "correctAnswer">Correct answer?</input>
</button>`;
var newquestionhtmlstring = `<fieldset class="questionbit" style="display:inline;">
	<legend>Question [number]</legend>
	<span class = "deletequestion closebutton">&times;</span>
	<input type="text" class="questionliteral" placeholder="Enter the question here">
	<div style="border:solid 1px black;">
		<p style="display:inline;">Question type:</p>
		<select class="questiontype">
			<option value="multichoice">Multi-Choice Question</option>
			<option value="textchoice">Text Question</option>
		</select>
		<div class="choices">
			<div style="display: none;" class="textchoice">
				<span>Enter correct answer here:&nbsp;</span>
				<input type="text" class="correctanswer" />
				<input type="checkbox" class="iscasesensitive">Case-sensitive?</input>
			</div>
			<div style="display: inline-block;" class="multichoice">
				<button class = "addoption">Add option...</button>
				<span class="numofopts">Number of options: 2</span>
				${newoptionhtmlstring}
				${newoptionhtmlstring}
			</div>
		</div>
	</div>
	<div class="correctanswermessage">
		<span>Correct answer message:&nbsp;</span>
		<span contenteditable="" class="correctanswer msg content">Correct answer!</span>
	</div>
	<div class="incorrectanswermessage">
		<span>Incorrect answer message:&nbsp;</span>
		<span contenteditable="" class="incorrectanswer msg content">Incorrect answer!</span>
	</div>
	<div class="messageduration">
		<span>Correct/incorrect answer message duration (seconds):&nbsp;</span>
		<input class="answermessagetimelimit" type="number" min="0" value="3">
	</div>
	<div class="questionduration">
		<span>Question time limit (seconds):&nbsp;</span>
		<input class="questiontimelimit" type="number" min="0" value="10">
	</div>
	<div class="maxpointsachievable">
		<span>Max points achievable in question:&nbsp;</span>
		<input class="maxpoints" type="number" min="0" value="1000">
	</div>
</fieldset>`;

var invertedcommas = String.fromCharCode(34);
var htmlparser = new DOMParser();
var user = {};
//A de facto namespace for event listeners to be executed in order without the functions' references polluting the global namespace
const listenerNamespace = {
	/*To be executed AFTER the initital DOM loading function, IN ORDER from first to last*/
	nextDOMLoadFuncs: []
};

function changeanswertype(questiontypediv, newtype) {
	if (newtype === "text") {
		questiontypediv.children[1].style.display = "inline";
		questiontypediv.children[0].style.display = "none";
	} else if (newtype === "option") {
		questiontypediv.children[0].style.display = "inline";
		questiontypediv.children[1].style.display = "none";
	}
}

//No need to perform server-side validation here. It would be performed when the user attempts to send a quiz when not signed in. No need to waste server clock cycles on this
async function createquizcheck() {
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
	} else {
		alert("You need to be signed in to an account to create or edit your quiz!")
		window.location.href = window.location.origin;
	}
}

document.addEventListener("DOMContentLoaded", function(e) {
	let validPaths = [
		"/createquiz",
		"/editquiz"
	]
	if (validPaths.indexOf(window.location.pathname) !== -1) {
		createquizcheck();
	}

	//Get all option inflator buttons
	let elems = document.getElementsByClassName("optionsinflator");

	//Set the click event for all expansion buttons
	for (var elem of elems) {
		elem.addEventListener("click", async function(e) {
			console.log("Ugh!");
			let moreOptionsDiv = elem.parentElement.querySelector("div.moreoptions");
			if (elem.classList.contains("expanded")) {
				//Must contract more options
				elem.addEventListener("transitionend", function(e) {
					elem.textContent = "+";
				}, {once:true});
				elem.classList.remove("expanded");
				//Wait for the animation to complete before removing the element from display
				let p = new Promise(function(res, rej) {
					moreOptionsDiv.addEventListener("transitionend", res, {once:true});
				});
				moreOptionsDiv.classList.remove("show");
				//Forcefully trigger reflow
				document.body.offsetHeight;
				await p;
				moreOptionsDiv.classList.remove("visible");
			} else {
				//Must expand more options
				elem.addEventListener("transitionend", function(e) {
					//This would be minus, but remember that the element (and all its descendant nodes) have been rotated by 90 degrees, therefore the minus would be displayed as a short vertical line
					elem.textContent = "|";
				}, {once:true});
				elem.classList.add("expanded");
				moreOptionsDiv.classList.add("visible");
				//Forcefully trigger reflow
				document.body.offsetHeight;
				moreOptionsDiv.classList.add("show");
			}
		});
	}

	let showGradeComment = document.getElementById("showgradecomment");
	let addgraderange = document.getElementById("addgraderange");
	let gradeRangesList = document.getElementById("graderanges");

	let doBgMusic = document.getElementById("bgmusic");
	let bgMusicSrc = document.getElementById("bgmusicsrc");

	let doTimeLimit = document.getElementById("dotimelimit");

	let sendQuizAnswers = document.getElementById("sendquizanswers");
	let quizAnswersRecipientEmail = document.getElementById("quizanswersrecipientemail");

	let privateQuiz = document.getElementById("privatequiz");

	let doAnswerBuzzers = document.getElementById("doanswerbuzzers");
	let correctAnswerBuzzerSrc = document.getElementById("correctanswersrc");
	let incorrectAnswerBuzzerSrc = document.getElementById("incorrectanswersrc");

	doBgMusic.addEventListener("change", function(e) {
		bgMusicSrc.disabled = !e.currentTarget.checked;
	});

	doTimeLimit.addEventListener("change", function(e) {
		//Do not cache this, even though it would have no implications due to it being a live list, which updates to reflect the DOM's latest state
		var timelimitoptions = document.getElementsByClassName('timelimitoption');
		for (let i = 0; i < timelimitoptions.length; i++) {
			timelimitoptions[i].disabled = !e.currentTarget.checked;
		}
	});

	//Add a change listener to the showgrade checkbox
	document.getElementById("showgrade").addEventListener("change", function(e) {
		if (e.currentTarget.checked) {
			showGradeComment.disabled = false;
		} else {
			showGradeComment.checked = false;
			showGradeComment.disabled = true;
		}
		//Propagate the change to the next element
		showGradeComment.dispatchEvent(new Event('change'));
	});

	//Add a change listener to the showgradecomment checkbox
	showGradeComment.addEventListener("change", function(e) {
		//Select all of the range entries
		var inputfields = gradeRangesList.querySelectorAll('.rangecomponent');
		//Select all of the range entries' comment sections (contenteditable divs)
		var inputfieldsCE = gradeRangesList.querySelectorAll('.editablerangecomponent');
		for (let i = 0; i < inputfields.length; i++) {
			inputfields[i].disabled = !e.currentTarget.checked;
		}
		for (let i = 0; i < inputfieldsCE.length; i++) {
			inputfieldsCE[i].setAttribute('contenteditable', e.currentTarget.checked);
		}
		addgraderange.disabled = !e.currentTarget.checked;
	});

	//Button to add a new grade range on click
	addgraderange.addEventListener("click", function(e) {
		addgraderange(e.currentTarget.parentElement);
	});

	sendQuizAnswers.addEventListener("change", function(e) {
		quizAnswersRecipientEmail.disabled = !e.currentTarget.checked;
	});

	privateQuiz.addEventListener("change", function(e) {
		document.getElementById('allowedquizparticipants').disabled = !e.currentTarget.checked;
	});

	doAnswerBuzzers.addEventListener("change", function(e) {
		correctAnswerBuzzerSrc.disabled = !e.currentTarget.checked;
		incorrectAnswerBuzzerSrc.disabled = !e.currentTarget.checked;
	});

	//Set the event handler for the submit button
	document.getElementById("submitbutton").addEventListener("click", async function(e) {
		//Fix this
		//document.getElementById('createquiz').style.display = 'none';
		let bgDiv = document.createElement("div");
		bgDiv.classList.add("bgdiv");
		bgDiv.addEventListener("click", async function(e) {
			if (e.target === bgDiv) {
				let p = new Promise(function(res, rej) {
					bgDiv.addEventListener("transitionend", res, {once: true});
				});
		
				//Trigger the animation
				bgDiv.classList.remove("visible");
				
				await p;

				//Delete the background div after the animation completes itself
				bgDiv.remove();
			}
		});

		let frameDiv = document.createElement("div");
		frameDiv.classList.add("minipage");
		bgDiv.appendChild(frameDiv);

		let promptSpan = document.createElement("span");
		promptSpan.classList.add("quizCodePrompt");
		promptSpan.textContent = "One last step... what's the code?";
		frameDiv.appendChild(promptSpan);

		var qc = document.createElement('input');
		qc.type = 'text';
		qc.placeholder = 'Set the code of your quiz here:';
		frameDiv.appendChild(qc);

		var btn = document.createElement('button');
		btn.addEventListener("click", function() {
			sendquiz(
				JSON.stringify(
					new quizMetadataObject(
						document.getElementById('quiztitle').value,
						document.getElementById('bgmusic').checked,
						document.getElementById('bgmusicsrc').value,
						document.getElementById('dotimelimit').checked,
						document.getElementById('doanswerbuzzers').checked,
						document.getElementById('showgrade').checked,
						document.getElementById('showgradecomment').checked,
						document.getElementById('graderanges'),
						document.getElementById('correctanswersrc').value,
						document.getElementById('incorrectanswersrc').value,
						document.getElementById('sendquizanswers').checked,
						document.getElementById('quizanswersrecipientemail').value,
						document.getElementById('showpoints').checked,
						document.getElementById('privatequiz').checked,
						document.getElementById('allowedquizparticipants').value.split('\n'),
						Math.floor(Number(document.getElementById('quizagerestriction').value)),
						document.getElementById('showcorrectanswers').checked
					)
				), new quizQuestionsObject(
					document.getElementById('quizset')
				)
			, qc.value);
		});
		btn.textContent = 'Create the quiz!';
		frameDiv.appendChild(btn);


		document.body.appendChild(bgDiv);

		//Trigger a reflow to render the element in the document in its current state, with its current classList
		document.body.offsetHeight;

		let p = new Promise(function(res, rej) {
			bgDiv.addEventListener("transitionend", res, {once: true});
		});

		//Trigger the animation
		bgDiv.classList.add("visible");

		await p;
	});

	for (let i = 0; i < listenerNamespace.nextDOMLoadFuncs.length; i++) {
		if (typeof listenerNamespace.nextDOMLoadFuncs[i] === "function") {
			listenerNamespace.nextDOMLoadFuncs[i](e);
		}
	}
}, {once:true});

function addnewquizoption(parentElem) {
	var question = htmlparser.parseFromString(newoptionhtmlstring, "text/html");
	//NOTE: If you intend to use a clone of this node, be sure to add the event listener to the clone (actually, the one which will be appended to the visible DOM)
	question.body.getElementsByClassName("closebutton")[0].addEventListener("click", function(e) {
		elem = e.currentTarget;
		if (elem.parentElement.parentElement.parentElement.getElementsByClassName('option').length > 2) {
			elem.parentElement.parentElement.parentElement.getElementsByClassName('numofopts')[0].textContent = `Number of options: ${(elem.parentElement.parentElement.getElementsByClassName('option').length - 1)}`;
			elem.parentElement.parentElement.remove();
		} else {
			alert('You must have at least two options!')
		}
	});
	if (parentElem instanceof HTMLElement) {
		parentElem.appendChild(question.body.children[0]);
	}
	let liveElementList;
	if (parentElem instanceof HTMLElement) {
		liveElementList = parentElem.getElementsByClassName("option");
	}
	return {
		likeChildren:liveElementList,
		latestOption: question.body.children[0]
	};
}

/**
 * 
 * @param {HTMLElement} parentElem The parent element to which the question data element will be appended. If not of type Element, will not append to any DOMElement
 * @param {Object} presets An object to specify defaults for the question. Formatting is as follows: {
 * 	question:text,
 * 	questionType:text,
 * 	answerOptions:[text],
 * 	correctAnswers:[text],
 * 	caseSensitive: bool,
 * 	correctAnswerMessage: text,
 * 	incorrectAnswerMessage: text,
 * 	timeLimit: number,
 * 	messageDuration: number,
 * 	maxpoints: number
 * }
 * @returns {HTMLElement} The question data element produced by the function
 */
function addquestion(parentElem, presets = {}) {
	var question = htmlparser.parseFromString(newquestionhtmlstring.replace("Question [number]", "Question " + (parentElem.querySelectorAll(".questionbit").length + 1)), "text/html");

	//If need be, apply presets to the elements
	if (presets.question !== undefined) {
		question.getElementsByClassName("questionliteral")[0].value = presets.question;
	}

	let questionType = question.getElementsByClassName("questiontype")[0];
	questionType.addEventListener("change", function(e) {
		var qtypediv = e.currentTarget.parentElement.getElementsByClassName("choices")[0];
		for (let i = 0; i < qtypediv.children.length; i++) {
			qtypediv.children[i].style.display = "none";
		};
		qtypediv.getElementsByClassName(e.currentTarget.value)[0].style.display = "";
	});
	if (presets.questionType !== undefined) {
		questionType.value = presets.questionType;
		//Update the element with the new change
		questionType.dispatchEvent(new Event("change"));
	}

	//Specify question type-specific data
	switch (presets.questionType) {
		case "multichoice":
			let mainParent = question.getElementsByClassName("multichoice")[0];
			//Multiple-choice option: prefill the options and their status (i.e.: correct or incorrect)
			if (presets.answerOptions.length > 1) {
				//Destroy the old options
				let options = question.getElementsByClassName("option");
				while (options.length > 0) {
					options[0].remove();
				}
				
				//Insert the new options
				let i;
				for (i = 0; i < presets.answerOptions.length; i++) {
					//Simply return the node; do not append it to any parent nodes
					let option = addnewquizoption().latestOption;
					if (presets.answerOptions[i] !== undefined) {
						option.getElementsByClassName("optioncontent")[0].innerHTML = presets.answerOptions[i];
					}
					option.getElementsByClassName("correctAnswer")[0].checked = (presets.correctAnswers.indexOf(presets.answerOptions[i]) !== -1);
					//Add the option to its parent nodes
					mainParent.appendChild(option);
				}
				//Specify the new number of questions
				mainParent.getElementsByClassName("numofopts")[0].textContent = `Number of options: ${i}`;
			}
			break;
		case "textchoice":
			//Text option: prefill the values
			if (presets.correctAnswers instanceof Array) {
				question.getElementsByClassName("correctanswer")[0].value = presets.correctAnswers[0];
			}
			question.getElementsByClassName("iscasesensitive")[0].checked = presets.caseSensitive;
			break;
	}

	//Specify default correct/incorrect answer messages from preset if specified
	if (presets.correctAnswerMessage !== undefined) {
		question.getElementsByClassName("correctanswer")[0].innerHTML = presets.correctAnswerMessage;
	}
	if (presets.incorrectAnswerMessage !== undefined) {
		question.getElementsByClassName("incorrectanswer")[0].innerHTML = presets.incorrectAnswerMessage;
	}
	
	//Specify default question time limit, answer message display time and points allotted per question (respectively) from preset if specified
	if (presets.timeLimit !== undefined) {
		question.getElementsByClassName("questiontimelimit")[0].value = presets.timeLimit;
	}
	if (presets.messageDuration !== undefined) {
		question.getElementsByClassName("answermessagetimelimit")[0].value = presets.messageDuration;
	}
	if (presets.maxpoints !== undefined) {
		question.getElementsByClassName("maxpoints")[0].value = presets.maxpoints;
	}

	question.getElementsByClassName("addoption")[0].addEventListener("click", function(e) {
		var options = addnewquizoption(e.currentTarget.parentElement);
		e.currentTarget.parentElement.getElementsByClassName("numofopts")[0].textContent = `Number of options: ${options.likeChildren.length}`;
	});

	let deleteOptionButtons = question.getElementsByClassName("deleteoption");
	for (let option of deleteOptionButtons) {
		option.addEventListener("click", function(e) {
			elem = e.currentTarget;
			if (elem.parentElement.parentElement.parentElement.getElementsByClassName('option').length > 2) {
				elem.parentElement.parentElement.parentElement.getElementsByClassName('numofopts')[0].textContent = `Number of options: ${(elem.parentElement.parentElement.getElementsByClassName('option').length - 1)}`;
				elem.parentElement.parentElement.remove();
			} else {
				alert('You must have at least two options!')
			}
		});
	}

	//On click, these delete their respective quiz question, unless it is the only one
	let deleteQuestionButtons = question.getElementsByClassName("deletequestion");
	for (let option of deleteQuestionButtons) {
		option.addEventListener("click", function(e) {
			if (document.getElementsByClassName('questionbit').length > 1) {
				//Can delete this question, since it is not the only one
				e.currentTarget.parentElement.setAttribute('class', 'null');
				var questions = document.getElementsByClassName('questionbit');
				for (let i = 0; i < questions.length; i++) {
					questions[i].querySelector('legend').textContent = `Question ${(i + 1)}`;
				}
				document.getElementById('questionsinquiz').textContent = `Number of questions in the quiz: ${document.querySelector('#quizset').querySelectorAll('.questionbit').length}`;
				e.currentTarget.parentElement.remove();
			} else {
				alert('You must have at least 1 question');
			}
		})
	}


	//Continue from here

	parentElem.appendChild(question.body.children[0]);
	//TODO: Remove this
	console.log(parentElem)
	document.querySelector("#questionsinquiz").innerHTML = "Number of questions in the quiz: " + parentElem.querySelectorAll(".questionbit").length
}

function addgraderange(parentElem, presets = {}) {
	var question = htmlparser.parseFromString(newgraderangehtmlstring, "text/html");

	if (presets.min !== undefined) {
		question.getElementsByClassName("mingrade").value = presets.min;
	}
	if (presets.max !== undefined) {
		question.getElementsByClassName("maxgrade").value = presets.max;
	}
	if (presets.comment !== undefined) {
		question.getElementsByClassName("gradecomment").value = presets.comment;
	}

	if (parentElem instanceof HTMLElement) {
		parentElem.appendChild(question.body.children[0]);
	}
}

class quizMetadataObject {
	constructor(quiztitle, bgmusic, bgmusicsrc, dotimelimit, answerbuzzers, showgrade, showgradecomment, gradecommentselem, correctanswerbuzzersrc, incorrectanswerbuzzersrc, sendAnswers, answersrecipient, showpoints, privatequiz, allowedparticipants, agerestriction, showcorrectanswers) {
		this.quiztitle = quiztitle;
		this.bgmusic = bgmusic;
		if (bgmusic) {
			this.bgmusicsrc = bgmusicsrc;
		} else {
			this.bgmusicsrc = null;
		}
		this.dotimelimit = dotimelimit;
		this.answerbuzzers = answerbuzzers;
		if (answerbuzzers) {
			this.correctanswerbuzzersrc = correctanswerbuzzersrc;
			this.incorrectanswerbuzzersrc = incorrectanswerbuzzersrc;
		} else {
			this.correctanswerbuzzersrc = null;
			this.incorrectanswerbuzzersrc = null;
		}
		this.showgrade = showgrade;
		if (this.showgrade) {
			this.showgradecomment = showgradecomment;
		} else {
			this.showgradecomment = false;
		}
		//How about "this.showgradecomment = showgradecomment && this.showgrade;"

		this.resulthtmlcommentranges = [];
		if (showgradecomment) {
			for (let i = 0; i < gradecommentselem.querySelectorAll("fieldset").length; i++) {
				var currentrange = gradecommentselem.querySelectorAll("fieldset")[i]
				this.resulthtmlcommentranges.push({min:currentrange.querySelectorAll("input")[0].value, max:currentrange.querySelectorAll("input")[1].value, comment:currentrange.querySelector(".editablerangecomponent").innerHTML});
			}
		}
		this.sendAnswers = sendAnswers;
		if (sendAnswers) {
			this.answersrecipient = answersrecipient
		} else {
			this.answersrecipient = "";
		}

		this.showcorrectanswers = showcorrectanswers;

		this.showpoints = showpoints;

		this.agerestriction = agerestriction;

		this.privatequiz = privatequiz;
		if (privatequiz) {
			if (allowedparticipants.indexOf(user.email) === -1) {
				allowedparticipants.push(user.email);
			}
			this.allowedparticipants = allowedparticipants
		} else {
			this.allowedparticipants = [];
		}

		//Quiz format: {quiztitle:"A quiz", bgmusic:false, bgmusicsrc: "", dotimelimit:false, answerbuzzers: true, showgrade:true, showgradecomment: true, resulthtmlcommentranges:[{min:0, max:0, comment:''}], correctanswerbuzzersrc: "", incorrectanswerbuzzersrc: "", showpoints: true, questions:[{question:"", questionType:"options", options:["", "", "", ""], answer:"", correctanswermessage:"", incorrectanswermessage:"", timelimit:60000, messageduration:2000, maxpointsperquestion:1000}]}
	}
}

//TODO: Populate this barren, deserted land with comments!
class quizQuestionsObject {
	constructor(questionselem) {
		this.questions = [];
		//Get a live list of fieldsets
		let questionFieldsets = questionselem.getElementsByTagName("fieldset");
		let currentQuestionType;
		for (let i = 0; i < questionFieldsets.length; i++) {
			var currentquestion = questionFieldsets[i];
			var optionsarray = [], correctanswersarray = [];
			currentQuestionType = currentquestion.getElementsByClassName("questiontype")[0].value;
			if (currentQuestionType === "multichoice") {
				let multiChoiceOptions = currentquestion.getElementsByClassName("option");
				for (let i = 0; i < multiChoiceOptions.length; i++) {
					optionsarray.push(multiChoiceOptions[i].getElementsByClassName("content")[0].innerHTML);
					if (multiChoiceOptions[i].getElementsByClassName("correctAnswer")[0].checked) {
						correctanswersarray.push(multiChoiceOptions[i].getElementsByClassName("content")[0].innerHTML);
					}
				}
			} else if (currentQuestionType === "textchoice") {
				correctanswersarray.push(currentquestion.getElementsByClassName("correctanswer")[0].value);
			}
			this.questions.push({
				question:currentquestion.getElementsByClassName("questionliteral")[0].value,
				questionType:currentquestion.getElementsByClassName("questiontype")[0].value,
				options:optionsarray,
				answers:correctanswersarray,
				caseSensitive:currentquestion.getElementsByClassName("iscasesensitive")[0].checked,
				correctanswermessage:currentquestion.getElementsByClassName("correctanswermessage")[0].children[1].innerHTML,
				incorrectanswermessage:currentquestion.getElementsByClassName("incorrectanswermessage")[0].children[1].innerHTML,
				timelimit:parseFloat(currentquestion.getElementsByClassName("questionduration")[0].children[1].value) * 1000,
				messageduration:parseFloat(currentquestion.getElementsByClassName("messageduration")[0].children[1].value) * 1000,
				maxpointsperquestion:currentquestion.getElementsByClassName("maxpointsachievable")[0].children[1].value,
			});
		}
	}
}

async function sendquiz(quizMetadataJSON, quizQuestions, quizcode) {
		quizcode = encodeURIComponent(quizcode);
		var xhr = new XMLHttpRequest();
		console.log(quizcode);
		xhr.open("POST", location.origin + "/sendnewquiz?qc=" + quizcode, true);
		xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
		xhr.responseType = "text";
		xhr.send(quizMetadataJSON);
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
		}).catch(function() {
			try {
				alert("Failed to create quiz: " + xhr.response.error);
			} catch (e) {
				alert("Failed to create quiz. (Error " + xhr.status + "). Please ensure that you are logged in to an account with a stable internet connection and try again");
			}
			throw "QuizCreationError: Failed to create quiz. XHR Status: " + xhr.status;
		});
		if (xhr.status === 200) {
			try {
				for (let i = 0; i < quizQuestions.questions.length; i++) {
					//Must always be question-by-question for server-side question counting
					socket.emit("quizQuestionStream", JSON.stringify(quizQuestions.questions[i]));
					console.log(i, quizQuestions.questions[i]);
					await new Promise(function(res, rej) {
						var successHandler = function() {
							//Make function remove outcome handlers from socket handlers list
							socket.removeListener("streamwritecompleted", successHandler);
							socket.removeListener("streamwritefailed", failureHandler);
							res();
						}, failureHandler = function() {
							//Make function remove outcome handlers from socket handlers list
							socket.removeListener("streamwritecompleted", successHandler);
							socket.removeListener("streamwritefailed", failureHandler);
							rej();
						};
						socket.on("streamwritecompleted", successHandler);
						socket.on("streamwritefailed", failureHandler)
					});
				}
				p = new Promise(function(res, rej) {
					var successHandler = function() {
						//Make function remove outcome handler from socket handlers list
						socket.removeListener("quizfilestreamclose", successHandler);
						res();
					};
					socket.on("quizfilestreamclose", successHandler);
				});
				//NEVER TRUST THE CLIENT - LISTEN FOR THIS SERVER-SIDE, BUT DO NOT RELY ON IT. HAVE A FALLBACK TO AUTOMATICALLY TERMINATE THe STREAM SESSION AFTER A FEW SECONDS OF INACTIVITY
				socket.emit("endstream");
				await p;
 				alert("Quiz successfully created!");
			} catch (e) {
				alert("Failed to create quiz: " + e);
			}
		} else {
			alert("Failed to create quiz: " + xhr.response);
		}
		console.log(xhr.status)
}

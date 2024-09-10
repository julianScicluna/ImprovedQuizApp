console.log('%c Stop! %c This console is for developers ONLY!!! DO NOT execute JavaScript on this console provided to you by ANYBODY unless you know what you are doing! People can use this to steal your sensitive information. This is known as Self-XSS!', 'font-size: 36px; font-weight: bold; font-family:Arial; color:red; text-shadow: #000 1px 1px;', 'font-size:15px; font-family:Arial; color:#00FFFF;');
var points = 0, time, correctanswers = 0, timeout, currentPromiseResFunction = function() {}, gradeAchieved = 0, totalquestions, bgmusicplayer = null, answered = false;
Array.prototype.shuffle = function() {
	for (var i = this.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var temp = this[i];
		this[i] = this[j];
		this[j] = temp;
	}
}
class timer {
	#progress;
	timer;
	constructor(initvalue, barcolor) {
		this.timer = document.createElement("div");
		this.timer.style.top = "0px";
		this.timer.style.left = "0px";
		this.timer.style.position = "absolute";
		this.timer.style.width = "100%";
		this.timer.style.height = "5px";
		this.timer.style.backgroundColor = "#CCCCCC";
		this.#progress = document.createElement("div");
		this.#progress.style.backgroundColor = barcolor;
		this.#progress.style.width = initvalue + "%";
		this.#progress.style.height = "100%";
		this.timer.appendChild(this.#progress);
		this.getTime = function() {
			return parseFloat(this.#progress.style.width.replace("%", ""));
		}
		this.setTime = function(value) {
			this.#progress.style.width = Math.min(100, parseFloat(value)) + "%";
		}
		document.getElementById("quizdiv").appendChild(this.timer);
	}
}

async function doXHR(method, URL, data = null, waittofinish, responseType = "text", successCallback = function() {console.log("XHR successfully loaded")}, failureCallback = function(err) {console.log(err); alert("Error loading data of quiz '" + quizcode + "'. (Error " + xhr.status + ")")}, headers) {
	var xhr = new XMLHttpRequest();
	xhr.open(method, URL);
	xhr.responseType = responseType;
	var keys = Object.keys(headers);
	for (let i = 0; i < keys.length; i++) {
		xhr.setRequestHeader(keys[i], headers[keys[i]]);
	}
	xhr.send(data);
	if (waittofinish) {
		await new Promise(function(res, rej) {
			xhr.onload = res;
			xhr.onerror = rej;
			xhr.onabort = function() {rej("abort")};
		}).then(function(rej) {
			if (xhr.status === 200) {
				console.log("XHR successfully loaded")
			} else {
				throw "XHRError: Could not load '" + URL + "'. Status code " + xhr.status;
			}
		}).catch(function(err) {
			if (err === "abort") {
				alert("Your request was aborted");
			} else {
				alert("Error loading data from URL '" + URL + "'. (Error " + xhr.status + ")");
				throw "XHR Error " + xhr.status + ": Resource not found"
			}
		});
	} else {
		xhr.onload = function() {successCallback(xhr.response)};
		xhr.onerror = function() {failureCallback(xhr.status)};
		xhr.onabort = function() {failureCallback(xhr.status)};
	}
	if (xhr.status === 200 && waittofinish) {
		return xhr.response;
	}
}

HTMLElement.prototype.removeChildren = function() {
	for (i = 0; i < this.children.length;) {
		this.children[i].remove();
	}
}
	
async function initialize() {
	let quizMetadata = await doXHR("GET", location.origin + "/getquizdata?qc=" + quizcode.getcode() + "&metadata=1", null, true, "json", ...Array(2), {"Content-Type":"application/json"});
	document.body.style.backgroundColor = "#ABCDEF";
	var elem = htmlparser.parseFromString(`<body><div><div style="left: 50%; top: 25%; -webkit-transform: translate(-50%, -50%); transform: translate(-50%, -50%); position:absolute;"><span>Quiz Creator:</span><img id = "creatorprofilepic" style="width:150px; height:150px; border-radius:150px; border:solid 1px black;"><br><div>
    <span id = "creatoremail">email: </span><br>
    <span id = "creatorusername">username: </span><br>
</div></div>
<div style="top:75%; left:50%; -webkit-transform: translate(-50%, -50%); transform: translate(-50%, -50%); position:absolute;"><input id = "username" type="text" style="height:33px; width:400px; font-size:30px;" placeholder="Enter your username here"><button id = "startquiz" style="min-height:33px; min-width:100px; font-size:30px;">Start quiz!</button></div></div>
</body>`, "text/html").body.children[0];
	document.getElementById("quizdiv").appendChild(elem);
	var quizcreatordata = await doXHR("POST", location.origin + "/getuserdata", JSON.stringify({email:quizMetadata.creatorEmail, fields:["username", "profilepic"]}), true, "json", ...Array(2), {"Content-Type":"application/json"});
	document.getElementById("creatorprofilepic").src = quizcreatordata.data.profilepic;
	document.getElementById("creatoremail").innerHTML = "email: " + quizMetadata.creatorEmail;
	document.getElementById("creatorusername").innerHTML = "username: " + quizcreatordata.data.username;
	document.getElementById("quiztitle").innerHTML = quizMetadata.quiztitle;
	var auth = await doXHR("GET", location.origin + "/checkAuth", null, true, "json", ...Array(2), {"Content-Type":"application/json"});
	document.getElementById("username").disabled = auth.authenticated;
	if (auth.authenticated) {
		var selfdata = await doXHR("POST", location.origin + "/getuserdata", JSON.stringify({email:auth.email, fields:["username"]}), true, "json", ...Array(2), {"Content-Type":"application/json"});
	}
	
	document.getElementById("startquiz").addEventListener("click", function() {
		if (auth.authenticated) {
			startquiz(selfdata.data.username, auth.email, quizMetadata);
		} else {
			startquiz(username.value, undefined, quizMetadata);
		}
	});
	document.body.style.backgroundColor = "rgba(" + Math.ceil(Math.random() * 255) + ", " + Math.ceil(Math.random() * 255) + ", " + Math.ceil(Math.random() * 255) + ", " + 255 + ")";
	document.getElementById("quiztitle").innerHTML = quizMetadata.quiztitle;
	document.getElementsByTagName("title")[0].innerHTML = "Quiz: " + quizMetadata.quiztitle;
}

async function startquiz(username = "Player", email = undefined, quizMetadata) {
	let playerAnswers = [], points = 0, questionOrder = [], questionData = [];
	for (let i = 0; i < quizMetadata.numQuestions; i++) {
		questionOrder[i] = i;
	}
	let quizdata;
	questionOrder.shuffle();
	document.getElementById("quizdiv").removeChildren();
	var counter = document.createElement("div");
	counter.style.fontFamily = "Calibri";
	counter.style.fontSize = "50px"
	counter.style.top = (window.innerHeight/2) + "px";
	counter.style.left = (window.innerWidth/2) + "px";
	counter.style.position = "absolute";
	document.getElementById("quizdiv").appendChild(counter);
	for (i = 3; i > -1; i--) {
		document.body.style.backgroundColor = "rgba(" + Math.ceil(Math.random() * 255) + ", " + Math.ceil(Math.random() * 255) + ", " + Math.ceil(Math.random() * 255) + ", " + 255 + ")";
		counter.style.top = (window.innerHeight/2) + "px";
		counter.style.left = (window.innerWidth/2) + "px";
		if (i != 0) {
			counter.innerHTML = i;
		} else {
			counter.innerHTML = "GO!!!";
		}
		await new Promise(function(res, rej) {setTimeout(res, 1000)});
	}
	counter.remove();
	if (quizMetadata.bgmusic) {
		bgmusicplayer = new Sound(quizMetadata.bgmusicsrc);
		await bgmusicplayer.play(true);
	}
	for (let i = 0; i < quizMetadata.numQuestions; i++) {
		quizdata = (await doXHR("GET", location.origin + "/getquizdata?qc=" + quizcode.getcode() + "&firstQuestionIndex=" + questionOrder[i] + "&numQuestions=1&metadata=0", null, true, "json", ...Array(2), {"Content-Type":"application/json"})).data[0];
		questionData.push(quizdata);
		answered = false;
		document.body.style.backgroundColor = "rgb(" + Math.ceil(Math.random() * 255) + ", " + Math.ceil(Math.random() * 255) + ", " + Math.ceil(Math.random() * 255) + ")";
		document.getElementById("questionsdone").innerHTML = "question " + (i + 1) + " of " + quizMetadata.numQuestions;
		var questiontitle = document.createElement("span");
		questiontitle.innerHTML = quizdata.question;
		document.getElementById("quizdiv").appendChild(questiontitle);
		document.getElementById("quizdiv").appendChild(document.createElement("br"));
		if (quizdata.questionType === "multichoice") {
			for (let j = 0; j < quizdata.options.length; j++) {
				var rcolor = {r: Math.ceil(Math.random() * 255), g: Math.ceil(Math.random() * 255), b: Math.ceil(Math.random() * 255), a: Math.ceil(Math.random() * 255)}
				var potentialoption = document.createElement("div");
				potentialoption.innerHTML = quizdata.options[j];
				potentialoption.className = "potentialoption";
				//potentialoption.addEventListener("click", function() {
				//	submitanswer(potentialoption.innerHTML, i);
				//});
				potentialoption.style.backgroundColor = "rgba(" + rcolor.r + ", " + rcolor.g + ", " + rcolor.b + ", " + 255 + ")";
				potentialoption.style.color = "rgba(" + (255-rcolor.r) + ", " + (255-rcolor.g) + ", " + (255-rcolor.b) + ", " + 255 + ")";
				potentialoption.style.fontFamily = "Calibri";
				potentialoption.style.fontSize = "20px";
				potentialoption.style.borderRadius = "10px";
				potentialoption.style.display = "inline-block";
				potentialoption.style.width = (screen.width/quizdata.options.length) + "px";
				potentialoption.style.height = (screen.width/quizdata.options.length) + "px";
				document.getElementById("quizdiv").appendChild(potentialoption);
			}
		} else if (quizdata.questionType === "textchoice") {
			var answer = document.createElement("textarea");
			answer.placeholder = "Type your answer here...";
			answer.style.fontFamily = "Calibri";
			answer.style.resize = "both";
			answer.style.width = "250px";
			answer.style.height = "100px";
			document.getElementById("quizdiv").appendChild(answer);
			var submit = document.createElement("button");
			//submit.addEventListener("click", function() {submitanswer(answer.value, i)});
			document.getElementById("quizdiv").appendChild(submit);
		}
		
		points += await new Promise(async function(res, rej) {
			var now = Date.now();
			if (quizdata.questionType === "multichoice") {
				for (let j = 0; j < document.getElementsByClassName("potentialoption").length; j++) {
					document.getElementsByClassName("potentialoption")[j].addEventListener("click", (function() {
						if (!quizMetadata.dotimelimit) {
							now = Date.now();
						}
						res({answervalue:this.innerHTML, questionindex:i, playerAnswers:playerAnswers, points:points, remainingtime:(quizdata.timelimit - (Date.now() - now)), clientData:{username:username, email:email}, quizdata, metadata:quizMetadata, questionData});
					}).bind(document.getElementsByClassName("potentialoption")[j]));
				}
			} else if (quizdata.questionType === "textchoice") {
				submit.addEventListener("click", function() {
					if (!quizMetadata.dotimelimit) {
						now = Date.now();
					}
					res({answervalue:submit.value, questionindex:i, playerAnswers:playerAnswers, points:points, remainingtime:(quizdata.timelimit - (Date.now() - now)), clientData:{username:username, email:email}, quizdata, metadata:quizMetadata, questionData});
				});
			}
			var t = new timer(100, "#0000FF");
			t.setTime(100);
			if (quizMetadata.dotimelimit) {
				while (Date.now() - now < parseFloat(quizdata.timelimit)) {
					t.setTime(100-((now + Date.now())/(quizdata.timelimit))*100) //Must be between 0 and 100
					await new Promise(function(res2, rej2) {setTimeout(res2, 20)});
					if (answered) {
						 break;
					}
				}
				if (!answered) {
					res({answervalue:null, questionindex:i, playerAnswers:playerAnswers, points:points, remainingtime:(quizdata.timelimit - (Date.now() - now)), clientData:{username:username, email:email}, quizdata, metadata:quizMetadata, questionData});
				}
			}
		}).then(submitanswer);
	}
}

async function showResults(playerAnswers, clientData, quizMetadata, questionData) {
	if (quizMetadata.bgmusic) {
		bgmusicplayer.destroy();
		bgmusicplayer = null;
	}
	let totalquestions = quizMetadata.numQuestions;
	document.body.removeChildren();
	document.body.style.backgroundColor = null;
	document.body.style.backgroundImage = "url('" + location.origin + "/server_data/server_media/quiz_complete.gif')";
	var msg = document.createElement("div");
	msg.style.color = "#FFFFFF";
	msg.style.border = "solid 1px black";
	msg.style.maxWidth = "200px";
	msg.style.minHeight = "50px";
	msg.innerHTML = '<i style = "background-color:blue; font-size:20px; font-family:Consolas;">Great job!!! You completed the quiz!!!</i>';
	document.body.appendChild(msg);
	await new Promise(function(res, rej) {setTimeout(res, 3000)});
	document.body.removeChildren();
	document.body.style.backgroundImage = null;
	document.body.style.backgroundColor = "rgba(255, 0, 255, 255)";
	if (quizMetadata.sendAnswers) {
		var keys = [{keyname:"", propname:undefined}, {keyname:"Question", propname:"question"}, {keyname:"Correct Answer(s)", propname:"correctAnswers"}, {keyname:"Player's answer", propname:"givenAnswer"}, {keyname:"Question Type", propname:"questionType"}, {keyname:"correct", propname:null}];
		var newdom = document.implementation.createHTMLDocument();
		var table = newdom.createElement("table");
		table.border = 1;
		table.style.borderCollapse = "collapse";
		newdom.body.appendChild(table);
		table.appendChild(newdom.createElement("tbody"));
		var tbody = table.children[0];
		for (let i = 0; i < playerAnswers.length + 1; i++) {
			let keyrow = newdom.createElement("tr");
			if (i === 0) {
				for (let j = 0; j < keys.length; j++) {
					let sector = newdom.createElement("td");
					sector.innerHTML = keys[j].keyname;
					keyrow.appendChild(sector);
				}
			} else {
				for (let j = 0; j < keys.length; j++) {
					let sector = newdom.createElement("td");
					if (j === 0) {
						sector.innerHTML = "Question " + i;
					} else {
						if (keys[j].propname === "correctAnswers") {
							sector.innerHTML = '<div style = "border:solid 1px black;">' + playerAnswers[i-1][keys[j].propname].join('</div><div style = "border:solid 1px black;">') + '</div>';
						} else if (keys[j].keyname === "correct") {
							sector.innerHTML = playerAnswers[i-1].correctAnswers.indexOf(playerAnswers[i-1].givenAnswer) != -1;
						} else if (keys[j].propname === "questionType") {
							sector.innerHTML = questionData[i-1].questionType.replace("multichoice", "Multiple choice question").replace("textchoice", "Typed answer question");
						} else {
							sector.innerHTML = playerAnswers[i-1][keys[j].propname];
						}
					}
					keyrow.appendChild(sector);
				}
			}
			tbody.appendChild(keyrow);
		}
		let err = true;
		//10 sending attempts
		for (let i = 0; i < 10 && err; i++) {
			try {
				await doXHR("POST", location.origin + "/sendquizresults", JSON.stringify({to:quizMetadata.answersRecipent, quizresults:table.outerHTML, email:clientData.email, username:clientData.username, quizTitle:quizMetadata.quiztitle, points:clientData.points, accuracy:((gradeAchieved/quizMetadata.numQuestions)*100) + "%"}), true, "json", ...Array(2), {"Content-Type":"application/json"})
				err = false;
			} catch (e) {
				console.log("Failed to send quiz to creator. Retrying...");
				err = true;
			}
		}
		if (err) {
			alert("Failed to send quiz to creator");
		}
	}
	if (quizMetadata.showgrade) {
		var span = document.createElement("span");
		span.innerHTML = "You scored...";
		span.style.color = "white";
		span.style.fontSize = "30px";
		span.style.fontFamily = "Calibri";
		document.body.appendChild(span);
		await new Promise(function(res, rej) {setTimeout(res, 3000)});
		span.innerHTML += "<br />" + gradeAchieved + "/" + totalquestions + "<br /> OR " + ((gradeAchieved/totalquestions) * 100) + "%<br />";
		if (quizMetadata.showgradecomment) {
			let i = 0, foundgraderange = false;
			while (i < quizMetadata.resulthtmlcommentranges.length && !foundgraderange) {
				if (gradeAchieved <= quizMetadata.resulthtmlcommentranges[i].min && gradeAchieved >= quizMetadata.resulthtmlcommentranges[i].max) {
					foundgraderange = true;
				} else {
					i++;
				}
			}
			var span = document.createElement("span");
			span.innerHTML = quizdata.resulthtmlcommentranges[i].comment;
			span.style.color = "white";
			span.style.fontSize = "30px";
			span.style.fontFamily = "Calibri";
			document.body.appendChild(span);
		}
	}
}

async function submitanswer(args) {
	let quizdata = args.quizdata;
	answered = true;
	let answervalue = args.answervalue, questionindex = args.questionindex, playerAnswers = args.playerAnswers;
	if (args.metadata.dotimelimit) {
		clearTimeout(timeout);
	}
	if (args.metadata.sendAnswers) {
		playerAnswers.push({questionindex:questionindex, question:quizdata.question, correctAnswers:quizdata.answers, givenAnswer:answervalue})
	}
	if (args.metadata.showcorrectanswers) {
		if (quizdata.questionType === "multichoice") {
			var options = document.getElementsByClassName("potentialoption");
			for (let i = 0; i < options.length; i++) {
				if (quizdata.answers.indexOf(options[i].innerHTML) === -1) {
					options[i].style.backgroundColor = "#FF0000";
				} else {
					options[i].style.backgroundColor = "#00FF00";
				}
				var clone = options[i].cloneNode(true);
				options[i].parentNode.replaceChild(clone, options[i]);
			}
		} else if (quizdata.questionType === "textchoice") {
			if (quizdata.caseSensitive) {
				if (quizdata.answers.indexOf(answervalue) === -1) {
					var correctanswer = document.createElement("span");
					span.innerHTML = "Correct answer(s): <br />-&nbsp;" + quizdata.answers.join("<br />-&nbsp;");
				} else {
					span.innerHTML = "Correct answer(s): <br />-&nbsp;" + quizdata.answers.map(function(ans) {if (answervalue === ans) {return "YOUR ANSWER!!! (You got this question correct)"} else {return ans;}}).join("<br />-&nbsp;");
				}
			} else {
				if (quizdata.answers.map(function(val) {return val.toLowerCase()}).indexOf(answervalue.toLowerCase()) === -1) {
					var correctanswer = document.createElement("span");
					span.innerHTML = "Correct answer(s): <br />-&nbsp;" + quizdata.answers.join("<br />-&nbsp;");
				} else {
					span.innerHTML = "Correct answer(s): <br />-&nbsp;" + quizdata.answers.map(function(ans) {if (answervalue === ans) {return "YOUR ANSWER!!! (You got this question correct)"} else {return ans;}}).join("<br />-&nbsp;");
				}
			}
		}
		await new Promise(function(res, rej) {setTimeout(res, 2000)});
	}
	document.getElementById("quizdiv").removeChildren();
	let htmldocofelems, modifiedanswervalue = answervalue;
	let correctanswers = quizdata.answers;
	if (!quizdata.caseSensitive) {
		if (modifiedanswervalue != null) {
			modifiedanswervalue = modifiedanswervalue.toLowerCase();
		}
		correctanswers = correctanswers.map(function(ans) {return ans.toLowerCase()});
	}
	let foundanswer = false;
	for (let i = 0; i < correctanswers.length && !foundanswer; i++) {
		if (modifiedanswervalue === correctanswers[i]) {
			foundanswer = true;
		}
	}
	var sound;
	if (foundanswer) {
		//correct answer
		gradeAchieved++;
		document.body.style.backgroundColor = "#00FF00";
		htmldocofelems = htmlparser.parseFromString('<svg width="250" height="200"><line x1="20" y1="120" x2="40" y2="140" style="stroke:rgb(255,255,255); stroke-width:10; stroke-linecap:round;"></line><line x1="40" y1="140" x2="200" y2="20" style="stroke:rgb(255,255,255); stroke-width:10; stroke-linecap:round;"></line><text x="50" y="170" fill="white" style="font-size:30px; font-family:Calibri;">Correct!!!</text></svg><br /><span>' + quizdata.correctanswermessage + '</span>', 'text/html');
		if (args.metadata.answerbuzzers && args.metadata.correctanswerbuzzersrc != null) {
			sound = new Sound(args.metadata.correctanswerbuzzersrc);
			await sound.playanddestroy();
		}
	} else {
		//incorrect answer
		document.body.style.backgroundColor = "#FF0000";
		htmldocofelems = htmlparser.parseFromString('<svg width="250" height="200"><line x1="40" y1="20" x2="200" y2="140" style="stroke:rgb(255,255,255); stroke-width:10; stroke-linecap:round;"></line><line x1="40" y1="140" x2="200" y2="20" style="stroke:rgb(255,255,255); stroke-width:10; stroke-linecap:round;"></line><text x="50" y="170" fill="white" style="font-size:30px; font-family:Calibri;">Incorrect!!!</text></svg><br /><span>' + quizdata.incorrectanswermessage + '</span>', 'text/html');
		if (args.metadata.answerbuzzers && args.metadata.incorrectanswerbuzzersrc != null) {
			sound = new Sound(args.metadata.incorrectanswerbuzzersrc);
			await sound.playanddestroy();
		}
	}
	document.getElementById("quizdiv").innerHTML = htmldocofelems.body.innerHTML;
	if (args.metadata.answerbuzzers) {
		await Promise.all([new Promise(function(res, rej) {setTimeout(res, quizdata.messageduration)}), new Promise(function(res, rej) {sound.playerElem.onended = res})]);
	} else {
		await new Promise(function(res, rej) {setTimeout(res, quizdata.messageduration)});
	}
	document.getElementById("quizdiv").removeChildren();
	if (quizdata.showpoints) {
		document.getElementById("quizdiv").removeChildren();
		var pts = document.createElement("span");
		pts.style = "display:flex; justify-content:center; align-items:center; font-size:50px;"
		pts.innerHTML = args.points + "pts";
		document.getElementById("quizdiv").appendChild(pts);
	}
	var ptsdiff = 0;
	if (quizdata.caseSensitive) {
		if (quizdata.answers.indexOf(answervalue) != -1) {
			ptsdiff = (args.remainingtime/parseFloat(quizdata.timelimit)) * parseFloat(quizdata.maxpointsperquestion);
		}
	} else {
		if (quizdata.answers.map(function(val) {return val.toLowerCase()}).indexOf(answervalue.toLowerCase()) != -1) {
			ptsdiff = (args.remainingtime/parseFloat(quizdata.timelimit)) * parseFloat(quizdata.maxpointsperquestion);
		}
	}
	if (quizdata.showpoints) {
		for (let i = 0; i < ptsdiff; i++) {
			await new Promise(function(res, rej) {setTimeout(res, 1)});
			pts.innerHTML = (args.points + i) + " pts";
		}
		await new Promise(function(res, rej) {setTimeout(res, 1000)});
		document.getElementById("quizdiv").removeChildren();
	}
	ptsdiff = parseInt(Math.max(ptsdiff, 0), 10);
	console.log(ptsdiff)
	if (questionindex >= args.metadata.numQuestions - 1) {
		args.clientData.points = args.points + ptsdiff;
		showResults(playerAnswers, args.clientData, args.metadata, args.questionData);
	} else {
		return ptsdiff;
	}
}

/**
 * This script must have all the properties of quizcreatorscript accessible to it. Modules sound like a viable approach...
 */

let searchParams = new URLSearchParams(window.location.search);

let quizCode = searchParams.get("qc");

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

async function getQuizData() {
    let data = {};

    //Prepare the reference
    let latestPromise;

    let res = await fetch(`/getQuizData?qc=${quizCode}&getquestions=1`, {
        method: "GET"
    });
	if (res.status !== 200) {
		//Something went wrong! Get the message and display it to the user!
		alert(await res.text());
		return;
	}
	//Response ok! Response MIME type will be application/json! Parse the JSON to get an object
	try {
		data.quizMetadata = await res.json();
	} catch (e) {
		alert("Failed to parse quiz metadata!");
		return;
	}
    data.questions = [];
    let iteration;
    for (let i = 0; i < data.quizMetadata.quizData.numQuestions; i++) {
        iteration = 0;
        do {
            latestPromise = createSocketResponsePromise("questionData", 5000);
            //DO NOT ACKNOWLEDGE RECEIPT FOR QUESTIONS WHICH HAVE NOT YET BEEN RECEIVED (i.e.: only send either of these messages on the first listening event)
            if (iteration === 0) {
                if (i === 0) {
                    socket.emit("readyStream");
                } else {
                    socket.emit("questionReceived");
                }
            }
            iteration++;
        } while ((await latestPromise).errorCode === "timeoutExceeded");
        //In this case, the promise would have already been resolved, causing "await latestPromise" to yield instantly
        data.questions.push(JSON.parse(await latestPromise));
    }
    //Create a promise which will be resolved when the server acknowledges that the stream is complete
    latestPromise = createSocketResponsePromise("streamReady", 5000);

    //Acknowledge receipt of the very last question
    socket.emit("questionReceived");
    await latestPromise;

    return data;
}

let quizFillOnDOMLoad = function(quizData) {
	//Parse JSON objects first
	quizData.quizMetadata.quizData.resultHTMLCommentRangesJSON = JSON.parse(quizData.quizMetadata.quizData.resultHTMLCommentRangesJSON);
	quizData.quizMetadata.quizData.allowedParticipantsListJSON = JSON.parse(quizData.quizMetadata.quizData.allowedParticipantsListJSON);


	//Set all the quiz fields to the values stored in the DB
	document.getElementById("quiztitle").value = quizData.quizMetadata.quizData.quizTitle;

	document.getElementById("bgmusic").checked = (quizData.quizMetadata.quizData.backgroundMusicSrc == null);
	if (quizData.quizMetadata.quizData.backgroundMusicSrc != null) {
		document.getElementById("bgmusicsrc").value = quizData.quizMetadata.quizData.backgroundMusicSrc;
	}

	document.getElementById("dotimelimit").checked = quizData.quizMetadata.quizData.doTimeLimit;

	document.getElementById("showcorrectanswers").checked = quizData.quizMetadata.quizData.showCorrectAnswers;

	document.getElementById("sendquizanswers").checked = quizData.quizMetadata.quizData.sendAnswers;
	let quizAnswersRecipient = document.getElementById("quizanswersrecipientemail");
	quizAnswersRecipient.disabled = !quizData.quizMetadata.quizData.sendAnswers;
	if (quizData.quizMetadata.quizData.sendAnswers) {
		quizAnswersRecipient.value = quizData.quizMetadata.quizData.answersRecipient;
	}

	document.getElementById("showgrade").checked = quizData.quizMetadata.quizData.showGrade;
	let showGradeComment = document.getElementById("showgradecomment");
	showGradeComment.checked = quizData.quizMetadata.quizData.showGrade && quizData.quizMetadata.quizData.showGradeComment;
	showGradeComment.disabled = !quizData.quizMetadata.quizData.showGrade;

	document.getElementById("addgraderange").disabled = !showGradeComment.checked;

	let gradeRangesDiv = document.getElementById("graderanges");
	let gradeRanges = quizData.quizMetadata.quizData.resultHTMLCommentRangesJSON;
	for (let i = 0; i < gradeRanges.length; i++) {
		//TODO: Insert grade range objects
		addgraderange(gradeRangesDiv, gradeRanges[i]);
	}

	let doAnswerBuzzers = document.getElementById("doanswerbuzzers");
	doAnswerBuzzers.checked = quizData.quizMetadata.quizData.doAnswerBuzzers;
	let correctAnswerBuzzerSrc = document.getElementById("correctanswersrc");
	let incorrectAnswerBuzzerSrc = document.getElementById("incorrectanswersrc");
	correctAnswerBuzzerSrc.disabled = !doAnswerBuzzers.checked;
	incorrectAnswerBuzzerSrc.disabled = !doAnswerBuzzers.checked;
	if (doAnswerBuzzers.checked) {
		correctAnswerBuzzerSrc.value = quizData.quizMetadata.quizData.correctAnswerBuzzerSrc;
		incorrectAnswerBuzzerSrc.value = quizData.quizMetadata.quizData.incorrectAnswerBuzzerSrc;
	}

	document.getElementById("showpoints").checked = quizData.quizMetadata.quizData.showPoints;

	document.getElementById("quizagerestriction").value = quizData.quizMetadata.quizData.ageRestriction;

	let isQuizPrivate = document.getElementById("privatequiz");
	isQuizPrivate.checked = quizData.quizMetadata.quizData.privateQuiz;
	let allowedQuizParticipants = document.getElementById("allowedquizparticipants");
	allowedQuizParticipants.disabled = !isQuizPrivate.checked;
	if (isQuizPrivate.checked) {
		//Populate the field with text
		allowedQuizParticipants.value = quizData.quizMetadata.quizData.allowedParticipantsListJSON.join("\n");
	}

	let quizSet = document.getElementById("quizset");

	//Destroy the old questions, if applicable
	if (quizData.questions.length > 0) {
		let oldQuestions = document.getElementsByClassName("questionbit");
		while (oldQuestions.length > 0) {
			oldQuestions[0].remove();
		}
	}

	//Insert the questions
	for (let i = 0; i < quizData.questions.length; i++) {
		//TODO: PERFORM HTML SANITATION
		addquestion(quizSet, {
			question:quizData.questions[i].questionHTMLSanitised,
			questionType: quizData.questions[i].questionType,
			answerOptions: JSON.parse(quizData.questions[i].optionsJSON),
			correctAnswers: JSON.parse(quizData.questions[i].correctOptionsJSON),
			caseSensitive: quizData.questions[i].caseSensitive,
			correctAnswerMessage: quizData.questions[i].correctAnswerMessageHTMLSanitised,
			incorrectAnswerMessage: quizData.questions[i].incorrectAnswerMessageHTMLSanitised,
			timeLimit: quizData.questions[i].timeLimit,
			messageDuration: quizData.questions[i].messageDuration,
			maxpoints: quizData.questions[i].maxpoints,
		});
	}
}

//This should be a global variable
listenerNamespace.nextDOMLoadFuncs.push(async function() {
	//TODO: FIX THIS NIGHTMARE!
	quizFillOnDOMLoad(await getQuizData());
});
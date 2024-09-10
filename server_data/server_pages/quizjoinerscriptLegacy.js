function setListeners() {
  document.getElementById("submit").addEventListener("click", function(e) {
    joinquiz(document.getElementById("quizcode").value)
  });
  document.getElementById("quizcode").addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
      joinquiz(document.getElementById("quizcode").value)
    }
  });
}

class quizcode {
	static #currentquizcode = "";
	static getcode() {
		return this.#currentquizcode;
	}
	static setcode(newcode) {
		this.#currentquizcode = newcode;
	}
	static setpermanentcode(newcode) {
		if (typeof(newcode) === "string") {
			this.#currentquizcode = newcode;
			delete this.setpermanentcode;
			delete this.setcode;
			Object.freeze(this); //Note: Classes are templates for objects and are special objects themselves (they are blueprints for objects), they are treated as objects by the methods of the Object class meaning we can freeze them and stop almost any evil genius from changing the quiz code or adding any methods to modify it
		} else {
			throw "TypeError: " + newcode + " is not of type String";
		}
	}
}

async function joinquiz(code) {
	quizcode.setpermanentcode(code);
	var xhr = new XMLHttpRequest(), template = null;
	xhr.open("GET", location.origin + "/server_data/server_pages/htmlquiztemplates/Quiz_Template.html");
	xhr.responseType = "document";
	xhr.send();
	await new Promise(function(res, rej) {
		xhr.onload = res;
		xhr.onerror = function(err) {
			console.log(err);
			alert("The quiz of code '" + code + "' you are looking for cannot be reached. (Error " + xhr.status + ")");
			rej(err);
		}
		xhr.onabort = function() {
			alert("The request has been aborted");
			rej();
		}
	});
	template = xhr.response;
	xhr.open("GET", location.origin + "/getquizdata?qc=" + code + "&firstQuestionIndex=0&numQuestions=1&metadata=0");
	xhr.responseType = "json";
	xhr.setRequestHeader("Content-Type", "application/json");
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
		xhr.onabort = rej;
	}).catch(function(err /*not needed for now*/) {
		if (xhr.response != undefined) {
			if (xhr.response.error != undefined) {
				alert(xhr.response.error);
			}
		} else {
			alert("Error loading quiz resources (Error joining quiz: " + xhr.status + ")");
		}
		throw "XHRError: Status code " + xhr.status;
	});
	let scripts = document.getElementsByTagName("script");
	for (let i = 0; i < scripts.length;) {
		scripts[i].remove();
	}
	document.documentElement.innerHTML = template.documentElement.innerHTML;
	scripts = document.getElementsByTagName("script");
	var promisearray = [];
	//Create new script element to replace the old one
	for (let i = 0; i < scripts.length; i++) {
		let parentelem = scripts[i].parentElement;
		let script = document.createElement("script");
		let definedAttributes = scripts[i].getAttributeNames();
		for (let j = 0; j < definedAttributes.length; j++) {
			script[definedAttributes[j]] = scripts[i][definedAttributes[j]];
		}
		promisearray.push(new Promise(function(res, rej) {script.addEventListener("load", res)}));
		parentelem.appendChild(script);
		scripts[i].remove();
	}
	//Wait for all the scripts to load
	await Promise.all(promisearray);
	document.body.onload();
}

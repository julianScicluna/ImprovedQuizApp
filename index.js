const port = 8080, secret = "abcd123";
const fs = require("fs");
//const cparser = require("cookie-parser");
//const session = require("express-session");
//const JSONStream = require('JSONStream');
const http = require("http");
const favicon = require('serve-favicon')
const parser = require("body-parser");
const express = require("express");
const app = express();
const server = http.createServer(app);
//const linereader = require("readline");
const { Server } = require("socket.io");
const io = new Server(server);
const mysql = require("mysql");
const { KEYS } = require("node-gyp/lib/log");
const { connect } = require("http2");
const { ChildProcess } = require("child_process");
//const domparser = require("node-html-parser");
//const sanitise = require('sanitize-html');
//const { memoryUsage } = require("process");
//const { promises, BADFAMILY } = require("dns");
//const { error } = require("console");
//const { takeCoverage } = require("v8");
//const { promisify } = require("util");
app.use(favicon(__dirname + "/favicon.ico"));

//Create two-way map for session id and email
const sessionIDEmailMap = new Map();
const emailSessionIDMap = new Map();
//Create map for email to socket id
const emailSocketIDMap = new Map();
//Create map for email to db record id (have email map to multiple objects to allow the server to quickly fetch data from the email, obtained through the session id)
const emailDBRecordMap = new Map();

const cookiesRequireHTTPS = true;

//Create map to map session ids to creation dates
const sessionIDCreationDateMap = new Map();

//Create two-way map between session ids and socket ids for NON-LOGGED-IN CLIENTS ONLY. This allows for non-logged in clients to be identified when joining certain quizzes
const sessionIDSocketIDMap = new Map();
const socketIDSessionIDMap = new Map();

//Create map to map socket ids to sockets
const connectedSocketsMap = new Map();

//Create map to map email addresses to quiz sessions, which are used to save and manage quiz progress and prevent cheating
const emailQuizSessionMap = new Map();

const emailSocketIds = {};

const db = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "",
	database:"serverDB"
});

db.connect(function(err) {
	if (err) {
		//Throw the error to stop program execution. If an error is thrown here, PROGRAM EXECUTION MUST BE STOPPED
		throw err;
	} else {
		console.log("We have successfully connected to the DB... yay... was that an appropriate response?");
	}
});

//function to query db by accepting SQL and wrapping callback function into promise. 'data' is an optional array parameter for prepared statements
const queryDB = function(sql, data = []) {
	return new Promise(function(res, rej) {
		db.query(sql, data, function(err, result) {
			if (err) {
				rej(err);
			} else {
				res(result);
			}
		});
	});
};

//Store quiz data
class QuizSession {
	constructor(quizCode, emailAddress, quizQuestionIndex = 0, answersLogFileDir = "", quizPoints = 0, numCorrectAnswers = 0, questionOrder = []) {
		this.quizCode = quizCode;
		this.emailAddress = emailAddress;
		this.quizQuestionIndex = quizQuestionIndex;
		this.questionOrder;
		this.answersLogFileDir = answersLogFileDir;
		this.quizPoints = quizPoints;
		this.numCorrectAnswers = numCorrectAnswers;
		this.questionOrder = questionOrder;
	}
	static fromJSON(JSONData) {
		let obj = JSON.parse(JSONData);
		return new QuizSession(obj.quizCode, obj.emailAddress, obj.quizQuestionIndex, obj.answersLogFileDir, obj.quizPoints, obj.numCorrectAnswers, obj.questionOrder);
	}
	static fromObject(obj) {
		return new QuizSession(obj.quizCode, obj.emailAddress, obj.quizQuestionIndex, obj.answersLogFileDir, obj.quizPoints, obj.numCorrectAnswers, obj.questionOrder);
	}
}

/**Function to save current quiz state WITHOUT removing the quiz session from the map. Typically used in case of fatal and unexpected error or condition prior to termination IF AND ONLY IF the user is logged in*/
const saveQuizSession = async function(session) {
	//TODO: (V. IMP) Check for an existing duplicate record before attempting to insert a new one, which would, in the aforementioned circumstances throw a fatal error, which is undesirable and expensive. If an entry already exists, modify the existing one
	let numRecords = (await queryDB(`SELECT COUNT(quizcode) FROM quizsession WHERE quizCode = ? AND emailAddress = ?`, [
		session.quizCode,
		session.emailAddress
	]))[0]['COUNT(quizcode)'];
	if (numRecords === 0) {
		//This record does not exist: insert it!
		await queryDB(`INSERT INTO quizsession (quizCode, emailAddress, questionIndex, questionsOrderJSON, tempAnswersLogFileDir, quizPoints, numCorrectAnswers)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, [
			session.quizCode,
			session.emailAddress,
			session.quizQuestionIndex,
			JSON.stringify(session.questionOrder),
			session.answersLogFileDir,
			session.quizPoints,
			session.numCorrectAnswers
		]);
	} else {
		//This record exists: don't attempt to insert one with an identical composite primary key; modify it instead!
		//No need to modify quizCode and emailAddress; those are only defined on the record's creation
		await queryDB(`UPDATE quizsession
			SET questionIndex = ?,
			questionsOrderJSON = ?,
			tempAnswersLogFileDir = ?,
			quizPoints = ?,
			numCorrectAnswers = ?
			WHERE quizCode = ? AND emailAddress = ?`, [
			session.quizQuestionIndex,
			JSON.stringify(session.questionOrder),
			session.answersLogFileDir,
			session.quizPoints,
			session.numCorrectAnswers,
			session.quizCode,
			session.emailAddress
		]);
	}
}

//Mutating method to perform Fisher-Yates shuffle on array
const fisherYatesShuffle = function(arr) {
	//Remove this!
	//return arr.reverse();
	let randomIndex, temp;
	for (let i = 0; i < arr.length; i++) {
		//Ensure that the selected array index (i) and random index never equal
		do {
			randomIndex = Math.floor(Math.random() * arr.length)
		} while (i === randomIndex && arr.length < 1);
		//Swap values at array indices i and randomIndex
		temp = arr[i];
		arr[i] = arr[randomIndex];
		arr[randomIndex] = temp;
	}
	//For convenience, in case the function is plugged in as a parameter
	return arr;
}

//function to sanitise user input for SQL queries to prevent SQL injection attacks. NEVER TRUST THE CLIENT, EVER; Always use this method when involving user-provided SQL to queries
const sanitiseUserInputForSQL = function(data) {
	if (data == undefined) {
		return undefined;
	}
	return data.replaceAll("\"", "\"\"").replaceAll("\'", "\'\'");
};

const toSQLDateTime = function(dateObj = new Date()) {
	return `${("0000" + dateObj.getFullYear()).slice(-4)}-${("00" + (dateObj.getMonth() + 1)).slice(-2)}-${("00" + dateObj.getDate()).slice(-2)} ${("00" + (dateObj.getHours())).slice(-2)}:${("00" + (dateObj.getMinutes())).slice(-2)}:${("00" + (dateObj.getSeconds())).slice(-2)}`
}

const SQLFormats = {
	DATE_ONLY:0,
	DATE_TIME:1
}

Object.freeze(SQLFormats);

const isCharNumeric = function(char) {
	let code = char.charCodeAt(0);
	return code >= 48 && code <= 57;
}

const formatTemplateChars = ["Y", "M", "D", "h", "m", "s"];

const isSQLFormatted = function(dateStr, formatStr) {
	//Format as date field (YYYY-MM-DD)
	if (typeof dateStr !== "string") {
		return false;
	}
	if (dateStr.length !== formatStr.length) {
		return false;
	}
	let firstChar = null;
	let isCharTemplate = false;
	let wasPrevCharTemplate;
	let templateData = {};
	for (let i = 0; i < dateStr.length; i++) {
		wasPrevCharTemplate = isCharTemplate;
		isCharTemplate = formatTemplateChars.indexOf(formatStr[i]) !== -1;
		//Short-circuit AND to reduce unnecessary computations
		if (firstChar === null && isCharTemplate) {
			firstChar = formatStr[i];
			templateData[firstChar] = {index: i, value: ""};
		}
		if (!(wasPrevCharTemplate || isCharTemplate) || (formatStr[i] !== firstChar && isCharTemplate)) {
			//Two successive non-template characters OR abrupt change in template chars without ONE non-template char separator: malformed template
			throw new IllegalArgumentError("Malformed formatting string");
		}
		//Check if the separators don't equal or if the character replacing the template is not numeric
		if (!isCharNumeric(dateStr[i]) && isCharTemplate) {
			return false;
		}
		if (!isCharTemplate) {
			//Reset first character
			firstChar = null;
			if (dateStr[i] !== formatStr[i]) {
				return false;
			}
		} else {
			//Push this number to the string
			templateData[firstChar].value += dateStr[i];
		}
	}
	//Syntax has been checked and is probably correct if we are here... but what about value ranges? No month has 32 days, has it?
	for (let key in templateData) {
		switch (key) {
			case "Y": {
				break;
			}
			case "M": {
				if (Number(templateData[key].value) > 12) {
					return false;
				} else {
					break;
				}
			}
			case "D": {
				if (Number(templateData[key].value) > 31) {
					return false;
				} else {
					break;
				}
			}
			case "h": {
				if (Number(templateData[key].value) > 23) {
					return false;
				} else {
					break;
				}
			}
			case "m": {
				if (Number(templateData[key].value) > 59) {
					return false;
				} else {
					break;
				}
			}
			case "s": {
				if (Number(templateData[key].value) > 59) {
					return false;
				} else {
					break;
				}
			}
		}
	}
	//Syntax and value checks passed. Valid date!
	return true;
	/*switch (format) {
		case SQLFormats.DATE_ONLY: {
			//Format as date field (YYYY-MM-DD)
			if (dateStr.length !== 10) {
				return false;
			}
			for (let i = 0; i < dateStr.length) {

			}
			break;
		}
		case SQLFormats.DATE_TIME: {
			//Format as date time field (YYYY-MM-DD HH:MM:SS)
			if (dateStr.length !== 21) {
				return false;
			}
			break;
		}
	}*/
}

//TODO: actually fill this function with data
const sanitiseUserInputForHTML = function(data) {
	return data;
}

//set of functions to insert and manipulate data in various map. DO NOT directly write to these maps, but use these functions instead. Maps can be read
const mapModFuncs = {
	insertSessionIDEmail(sessionID, email) {
		sessionIDEmailMap.set(sessionID, email);
		emailSessionIDMap.set(email, sessionID);
		sessionIDCreationDateMap.set(sessionID, Date.now());
	},
	insertLoggedOutSessionIDSocketID(sessionID, socketID) {
		sessionIDSocketIDMap.set(sessionID, socketID);
		socketIDSessionIDMap.set(socketID, sessionID);
	},
	deleteLoggedOutDataFromSocketID(socketID) {
		//Get the corresponding session id before deletion
		let correspondingSessionID = socketIDSessionIDMap.get(socketID);
		socketIDSessionIDMap.delete(socketID);
		sessionIDSocketIDMap.delete(correspondingSessionID);
		console.log(`socket with id ${socketID} has been deleted...`)
		connectedSocketsMap.delete(socketID);
	},
	deleteLoggedOutDataFromSessionID(sessionID) {
		let correspondingSocketID = sessionIDSocketIDMap.get(sessionID);
		sessionIDSocketIDMap.delete(sessionID);
		socketIDSessionIDMap.delete(correspondingSocketID);
		console.log(`socket with id ${correspondingSocketID} has been deleted...`)
		connectedSocketsMap.delete(correspondingSocketID);
	},
	modifySessionIDFromEmail(newSessionID, email) {
		let oldSessionID = emailSessionIDMap.get(email);
		emailSessionIDMap.set(email, newSessionID);
		sessionIDEmailMap.delete(oldSessionID, email);
		sessionIDEmailMap.set(newSessionID, email);
	},
	//CHECK THESE FUNCTIONS CAREFULLY
	async deleteFromSessionID(sessionID) {
		let correspondingEmail = sessionIDEmailMap.get(sessionID);
		sessionIDEmailMap.delete(sessionID);
		emailSessionIDMap.delete(correspondingEmail);
		emailDBRecordMap.delete(correspondingEmail);
		emailSocketIDMap.delete(correspondingEmail);
		sessionIDCreationDateMap.delete(sessionID);
		//Check if there is a quiz session during logout. If there is, write it to the DB
		let oldQuizSession = emailQuizSessionMap.get(correspondingEmail);
		if (oldQuizSession != undefined) {
			/*await queryDB(`INSERT INTO quizsession (quizCode, emailAddress, questionIndex, questionsOrderJSON, tempAnswersLogFileDir, quizPoints, numCorrectAnswers)
				VALUES (?, ?, ?, ?, ?, ?, ?)`, [oldQuizSession.quizCode, oldQuizSession.emailAddress, oldQuizSession.quizQuestionIndex, JSON.stringify(oldQuizSession.questionOrder), oldQuizSession.answersLogFileDir]);*/
			//Write the quiz session to the DB if logged in (i.e.: if oldQuizSession, which is obtained from a map with its respective email as its key, is not undefined)
			//No need to await this function; its execution is independent of its argument's session's presence in the email-session map
			saveQuizSession(oldQuizSession);
			emailQuizSessionMap.delete(correspondingEmail);
		}
	},
	async deleteFromEmail(email) {
		let correspondingSessionID = emailSessionIDMap.get(email);
		emailSessionIDMap.delete(email);
		sessionIDEmailMap.delete(correspondingSessionID);
		emailDBRecordMap.delete(email);
		emailSocketIDMap.delete(email);
		sessionIDCreationDateMap.delete(correspondingSessionID);
		//Check if there is a quiz session during logoue. If there is, write it to the DB
		let oldQuizSession = emailQuizSessionMap.get(email);
		if (oldQuizSession != undefined) {
			/*await queryDB(`INSERT INTO quizsession (quizCode, emailAddress, questionIndex, questionsOrderJSON, tempAnswersLogFileDir)
				VALUES (?, ?, ?, ?, ?)`, [oldQuizSession.quizCode, oldQuizSession.emailAddress, oldQuizSession.quizQuestionIndex, JSON.stringify(oldQuizSession.questionOrder), oldQuizSession.answersLogFileDir]);*/
				saveQuizSession(oldQuizSession);
			emailQuizSessionMap.delete(email);
		}
	}
}
Object.freeze(mapModFuncs);

const sessionDuration = 86400000;

/**
 * Method to check whether a particular session id is outdated. If so, it would delete the session id and all associated login data server-side, effectively logging the user out. To be invoked every time authentication is needed
 * Returns true when user has been logged out (i.e.: updates have taken place).
 * Returns false otherwise.
*/
const updateSessionID = async function(sessionID) {
	if (Date.now() >= sessionIDCreationDateMap.get(sessionID) + sessionDuration) {
		//Outdated session - destroy
		await mapModFuncs.deleteFromSessionID(sessionID);
		return true;
	} else {
		return false;
	}
}

//TODO: Implement a system to dispose of old session ids for logged-out users

//Used with old flat-file mock DB system
//const userAccountPropLines = {EMAIL: 0, HASHEDPASSWORD: 1, USERNAME: 2, DATEOFBIRTH: 3, PROFILEPIC: 4, OWNEDQUIZZES: 5};
//userAccountPropLines.NUM_LINES_MAX = Object.keys(userAccountPropLines).length;
//Object.freeze(userAccountPropLines);
const handlers = ["onafterprint", "onbeforeprint", "onbeforeunload", "onerror", "onhashchange", "onload", "onmessage", "onoffline", "ononline", "onpagehide", "onpageshow", "onpopstate", "onresize", "onstorage", "onunload", "onblur", "onchange", "oncontextmenu", "onfocus", "oninput", "oninvalid", "onselect", "onsearch", "onselect", "onsumbit", "onkeydown", "onkeyup", "onkeypress", "onclick", "ondblclick", "onmousedown", "onmouseup", "onmousemove", "onmouseover", "onmouseout", "onmousewheel", "onwheel", "ondrag", "ondragstart", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondrop", "onscroll", "ondrag", "oncopy", "oncut", "onpaste", "ondrag", "onabort", "oncanplay", "oncanplaythrough", "oncuechange", "ondurationchange", "onemptied", "onerror", "onloadeddata", "onloadedmetadata", "onloadstart", "onpause", "onplay", "onplaying", "onprogress", "onpause", "onratechange", "onseeked", "onseeking", "onstalled", "onsuspend", "ontimeupdate", "onvolumechange", "onwaiting", "ontoggle"]
/*const validateDOM = function(Document) {
	var elems = Document.getElementsByTagName("script");
	for (let i = 0; i < elems.length; i++) {
		elems[i].remove();
	}
	for (let i = 0; i < handlers.length; i++) {
		let elems = Document.querySelectorAll("[" + handlers[i] + "]");
		for (let j = 0; j < elems.length; j++) {
			elems[j].removeAttribute(handlers[i]);
		}
	}
}*/

class IllegalArgumentError extends Error {
	constructor(message = "", ...args) {
		super(message, ...args);
		this.message = message;
	}
}

class TimeoutError extends Error {
	constructor(message = "", ...args) {
		super(message, ...args);
		this.message = message;
	}
}

class IllegalStateError extends Error {
	constructor(message = "", ...args) {
		super(message, ...args);
		this.message = message;
	}
}

class CatastrophicError extends Error {
	constructor(message = "", ...args) {
		super(message, ...args);
		this.message = message;
	}
}

//Function to perform quicksort on a single array. 'start' is the first index to take into consideration, 'end' is the last index to take into consideration, not the first index to ignore
function quicksort(arr, start = 0, end = arr.length - 1) {
    let j = start - 1, temp;
    if (end - start > 0) {
        for (let i = start; i < end + 1; i++) {
            if (arr[i] <= arr[end]) {
                j++;
                temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
            }
        }
        quicksort(arr, start, j - 1);
        quicksort(arr, j + 1, end);
    }
}

//Function to perform quicksort on multiple arrays relative to one in particular. 'start' is the first index to take into consideration, 'end' is the last index to take into consideration, not the first index to ignore
function quicksortParallel(arrarrs = [[]], mainArr = arrarrs[0], start = 0, end = mainArr.length - 1) {
	if (arrarrs.indexOf(mainArr) == -1) {
		throw new IllegalArgumentError("The array referenced by argument 'mainArr' must be within the 2D array parameter 'arrarrs'");
	}
	for (let i = 0; i < arrarrs.length - 1; i++) {
		if (arrarrs[i].length != arrarrs[i + 1].length) {
			throw new IllegalArgumentError("All the arrays within the 2D array argument arrarrs must be of equal length");
		}
	}
    let j = start - 1, temp;
    if (end - start > 0) {
        for (let i = start; i < end + 1; i++) {
            if (mainArr[i] <= mainArr[end]) {
                j++;
				for (let k = 0; k < arrarrs.length; k++) {
					temp = arrarrs[k][i];
					arrarrs[k][i] = arrarrs[k][j];
					arrarrs[k][j] = temp;
				}
            }
        }
        quicksort(arrarrs, mainArr, start, j - 1);
        quicksort(arrarrs, mainArr, j + 1, end);
    }
}

function shallowCopyArr(arr) {
	newArr = [];
	for (let index of arr) {
		newArr.push(index);
	}
	return newArr;
}

function bigIntToUInt8Array(num = 0n, bytesFill = 0) {
    if (typeof num !== "bigint") {
        console.warn("The number which you have specified is not a BigInt. therefore, it will be casted to one");
        num = BigInt(num);
    }
    let bigIntByteMask = BigInt(0xFF);
    arr = new Uint8Array(Math.max(Math.ceil((Math.log(new Number(num) + 1)/Math.log(2))/8), bytesFill));
    for (let i = 0; i < arr.length; i++) {
        arr[i] = new Number((num >> (8n * BigInt(arr.length - i - 1))) & bigIntByteMask);
    }
    return arr;
}

//Function to convert a UInt8Array to a Big-Endian BigInt
function UInt8ArrayToBigInt(arr) {
    var num = 0n;
    for (let i = 0; i < arr.length; i++) {
        num += arr[i] * (256**(arr.length - i - 1))
    }
    return num;
}



//object to handle custom data format to send multiple data types together in the same XMLHTTPRequest
//TODO: Add functionality to parse format with custom templates
const formatHandler = {
	//Methods to parse data with or without a known template. Those which do not require a parsing template (which is similar to a C struct with fields) tend to be relatively slow, yet do not require a parsing template, hence their existence
	decode: function(rawDataBuffer, template = "") {
		//declare three arrays in which to store keys and two corresponding values per key, where the specified 'values' are actually the start and end addresses of the values in the ensuing bytes, relative to the beginning of the data heap. The end address is the address of the first byte to be ignored
		let keys = [], starts = [], ends = [];
		var keyValueMap = {};
		//Variable to store the index (address) of the selected byte, similar to a pointer. Relative to the very first byte of the Buffer object referenced by the argument rawDataBuffer. Set to 8 due to the possible inital 64-bit (8-byte) template hash
		let index = 8;
		//Get the address of the two bytes which define the end of the key-address mappings. Key searches should not continue beyond this point
		//var keysEndIndex = rawDataBuffer.indexOf("0000", index, "hex");
		//Assuming correct formatting (given, will include verification method), there will always come a case where the index will EQUAL the address of the first byte of the two-byte sequence denoting the end of the key-value pairs - STOP THERE!
		//Keep getting keys and values until the two consecutive 0x00 bytes have been reached. DO NOT search for them using indexOf, for they might return the 0x00 chars inside the 64-bit pointers. This way, values will always be skipped
		while (rawDataBuffer[index] + rawDataBuffer[index + 1] > 0) {
			//Get the address of the byte separating key and value. The byte (control character) 0x00 should NEVER occur in the key, however it can occur in the value, for its size is always known: 8 bytes (64 bits)
			keyEnd = rawDataBuffer.indexOf("00", index, "hex");
			//read the key and value and insert them into their respective arrays (verbose code alert: fire the numpty who did not write this in C++! Oh, right... It's me, isn't it?)
			keys.push(rawDataBuffer.subarray(index, keyEnd).toString());
			starts.push(rawDataBuffer.readBigUInt64BE(keyEnd + 1));
			ends.push(rawDataBuffer.readBigUInt64BE(keyEnd + 9)); //The ninth byte relative to keyEnd is the first one; seven to go to make up eight; 9 + 7 = 16
			//Go to the next key (2 * 64-bit (unsigned) longs = 128 bits. 128/8 = 16 bytes), plus one to leave the 0x00 control character
			index = keyEnd + 17;
		};

		//Perform merge sort/quicksort to get addresses in ascending order
		//quicksortParallel([keys, values], values);

		//Convert the addresses into values, perhaps by storing the key-value pairs using back-to-back arrays, due to guaranteed ordering
		for (let i = 0; i < keys.length; i++) {
			keyValueMap[keys[i]] = rawDataBuffer.subarray(Number(starts[i]), Number(ends[i]));
		}
		return keyValueMap;
	},
    async encode(keysArr = [], valuesArr = [], template = {}) {
        //Validation: Check if key-value arrays are of equal length
        if (keysArr.length != valuesArr.length) {
            throw new IllegalArgumentError("The arrays storing keys and their respective values are not of equal length");
        }
        //Get the total length of all strings in keysArr
        let keysLenTotal = 0;
        for (let i = 0; i < keysArr.length; i++) {
            if (typeof keysArr[i] == "string") {
                keysLenTotal += keysArr[i].length + 1; /*Include the 00 bytes between key and 2 64-bit longs*/
            } else {
                throw new IllegalArgumentError("All indices within array 'keysArr' must be ASCII strings");
            }
        }
        //keysLenTotal includes the 0x00 control char after every key
        let keysAddressesLenTotal = 8 + keysLenTotal + (keysArr.length * 16) + 2;
        let valuesCumulativeSizes = [];
        //Get the total size of all values, which must be blobs
        for (let i = 0; i < valuesArr.length; i++) {
            if (valuesArr[i] instanceof Blob || typeof valuesArr[i] === "string") {
                if (valuesCumulativeSizes.length === 0) {
                    //Insert the first element in the array manually without depending on previous elements, for failing to do so can cause various errors and quirks involving the infamous 'NaN'
                    if (typeof valuesArr[0] === "string") {
                        valuesArr[0] = new Blob([valuesArr[0]], {type:"text/plain"});
                    }
                    valuesCumulativeSizes[0] = valuesArr[0].size;
                } else {
                    if (typeof valuesArr[i] === "string") {
                        valuesArr[i] = new Blob([valuesArr[i]], {type:"text/plain"});
                    }
                    valuesCumulativeSizes.push(valuesCumulativeSizes[valuesCumulativeSizes.length - 1] + valuesArr[i].size);
                }
            } else {
                throw new IllegalArgumentError("All indices within array 'valuesArr' must be Blobs, Buffers or strings (which are internally converted into blobs)");
            }
        }
        if (valuesCumulativeSizes.length === 0) {
            //No values (and therefore no keys) - create a cumulative length of 0
            valuesCumulativeSizes.push(0);
        }
        //Get the array's total size by adding the sizes of the 64-bit template hash, keys' sizes, 0x00 control characters separating keys and values, 128-bit (2 * 64-bit (unsigned long) pointers) values, 2 successive 0x00 control characters and blob sizes
        let stringEncoder = new TextEncoder();
        let rawByteArray = new Uint8Array(keysAddressesLenTotal + valuesCumulativeSizes[valuesCumulativeSizes.length - 1]);
        const keyAddrSeparationChar = new Uint8Array([0]);
        const keyValSeparationChars = new Uint8Array([0, 0]);
        let index = 0;
        //Enter the template's 64-bit hash (for now, has no use)
        //rawByteArray.set(bigIntToUInt8Array(hash(JSON.stringify(template)), 8), index);
		rawByteArray.set(bigIntToUInt8Array(0n, 8));
        index += 8;
        const LONG_MAX_SIZE = 2n**64n;
        for (let i = 0; i < keysArr.length; i++) {
            let charArray = stringEncoder.encode(keysArr[i]);
            if (charArray.indexOf(0) != -1) {
                throw new IllegalArgumentError("Encoded Key has 0x00 control character inside");
            }
            //Insert key and 0x00 control character and update index accordingly
            rawByteArray.set(charArray, index);
            index += charArray.length;
            //Do NOT merge two index incrementation statements; index MUST vary between the two UInt8Array.prototype.set(ArrayLike<Number>, Number) invocations
            rawByteArray.set(keyAddrSeparationChar, index);
            index++;
            //Compute and write the 64-bit start addresses to the buffer (The address of the first byte of the data, relative to the very first byte in rawByteArray)
            if (i === 0) {
                rawByteArray.set(bigIntToUInt8Array(BigInt(keysAddressesLenTotal), 8), index);
            } else {
                rawByteArray.set(bigIntToUInt8Array(BigInt(keysAddressesLenTotal + valuesCumulativeSizes[i - 1]), 8), index);
            }
            index += 8;
            //Compute and write the 64-bit end addresses to the buffer (The address of the first byte to ignore, relative to the very first byte in rawByteArray)
            if (i + 1 === valuesCumulativeSizes.length) {
                rawByteArray.set(bigIntToUInt8Array(BigInt(rawByteArray.length), 8), index);
            } else if (i === 0) {
                rawByteArray.set(bigIntToUInt8Array(BigInt(keysAddressesLenTotal + valuesCumulativeSizes[i]), 8), index);
            } else {
                rawByteArray.set(bigIntToUInt8Array(BigInt(keysAddressesLenTotal + valuesCumulativeSizes[i + 1]), 8), index);
            }
            index += 8;
        }
        rawByteArray.set(keyValSeparationChars, index);
        index += 2;
        //Begin writing the values to the heap
        for (let i = 0; i < valuesArr.length; i++) {
            let valBuf = await (valuesArr[i].arrayBuffer());
            let valArr = new Uint8Array(valBuf);
            rawByteArray.set(valArr, index);
            index += valArr.length;
        }
        return rawByteArray;
    }
};
Object.freeze(formatHandler);

//function to generate hashed password
const hash = function(str, m, p) {
    if (typeof(m) != "bigint") {
        m = BigInt(m);
    }
	//DO NOT USE if... else STATEMENT - IT IS POSSIBLE THAT BOTH VALUES ARE NOT BIGINTS
    if (typeof(p) != "bigint") {
        p = BigInt(p);
    }
    var n = 0n;
    for (let i = 0n; i <= str.length - 1; i++) {
        n += BigInt(str[i].codePointAt(0)) * p**i;
    }
    return (n % m).toString()/*.replace("n", "")*/;
}

function lookuploggedinuser(lookupbykey, lookupbykeyvalue) {
	for (let i = 0; i < loggedinusers.length; i++) {
		if (loggedinusers[i][lookupbykey] === lookupbykeyvalue) {
			return i;
		}
	}
	return -1;
}
function getCookies(req) {
	//Function to remove whitespace in cookie string, create an array of key-value pairs and turn them into an object, which will be returned
	//simply put, parse a set of cookies and return a JS object
	//create the object in which to store the key-value pairs in the cookie
	var obj = {};
	//Prevent errors due to lack of headers object
	if (req.headers == undefined) {
		return obj;
	}
	if (req.headers.cookie == undefined) {
		//In this case, no cookies would have been sent in the specified request payload
		return obj;
	}
	let val = req.headers.cookie;
	//split the string into individual key-value pairs in an array
	cookies = val.split("; ");
	for (let cookie of cookies) {
		//Iterate over the key-value string pairs and put them in an object, the key and value delimited by the VERY FIRST equals sign
		let equalsPos = cookie.indexOf("=");
		obj[cookie.slice(0, equalsPos)] = cookie.slice(equalsPos + 1);
	}
	return obj;
}

Object.prototype.equals = function(o) {
    let o1props = Object.getOwnPropertyNames(this);
    let o2props = Object.getOwnPropertyNames(o);
    var equal = true;
    if (o1props.length != o2props.length) {
        equal = false;
    }
    for (let i = 0; i < o1props.length; i++) {
        if (typeof(this[o1props[i]]) === "object" || typeof(o[o1props[i]]) === "object") {
            if (!(this[o1props[i]].equals(o[o1props[i]]))) {
                equal = false;
                break;
            }
        } else if (!(this[o1props[i]] === o[o1props[i]])) {
            equal = false;
            break;
        }
    }
    return equal;
}
Object.prototype.propsValuesEqual = function(o) {
    let o1props = Object.getOwnPropertyNames(this);
    let o2props = Object.getOwnPropertyNames(o);
    var equal = true;
    if (o1props.length > o2props.length) {
	let store = o1props;
	o1props = o2props;
	o2props = store;
    }
    for (let i = 0; i < o1props.length; i++) {
        if (typeof(this[o1props[i]]) === "object" || typeof(o[o1props[i]]) === "object") {
            if (!(this[o1props[i]].equals(o[o1props[i]]))) {
                equal = false;
                break;
            }
        } else if (!(this[o1props[i]] === o[o1props[i]])) {
            equal = false;
            break;
        }
    }
    return equal;
}
function createUUID(){
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}
app.use(parser.raw({limit:'50mb', type:'application/octet-stream'}));
app.use(parser.json({limit:'50mb', type:'application/json'}));
//app.use(cparser());
/*app.use(session({
    secret: secret,
    saveUninitialized:true,
    cookie: { maxAge:86400000, httpOnly:true },
    resave: false,
    unset:"destroy"
}));*/
app.get("/", function(req, res) {
	res.sendFile(__dirname + "/server_data/server_pages/Quiz_Homepage.html");
});
app.get("/createquiz", function(req, res) {
	res.sendFile(__dirname + "/server_data/server_pages/Quiz_Creation_Page.html");
});
app.get("/joinquiz", function(req, res) {
	res.sendFile(__dirname + "/server_data/server_pages/Quiz_Joining_Page.html");
});
app.get("/viewquizzes", function(req, res) {
	res.sendFile(__dirname + "/server_data/server_pages/Quiz_Viewing_Page.html");
});
app.get("/editquiz", function(req, res) {
	res.sendFile(__dirname + "/server_data/server_pages/Quiz_Editing_Page.html");
});

//TODO: Get back to this
/*app.get("/getexistingquizcodes", async function(req, res) {
	var codes = await new Promise(function(res, rej) {
		fs.readdir(__dirname + "/server_data/existingquizzes", function(err, arr) {if (!err) {res(arr)} else {rej(err)}});
	});
	res.writeHead(200, {"Content-Type":"application/json"});
	res.end(JSON.stringify(codes));
});*/
app.get("/login", function(req, res) {
	if (sessionIDEmailMap.get(getCookies(req).sessionid) == undefined) {
		res.sendFile(__dirname + "/server_data/server_templates/loginpage.html");
	} else {
		res.writeHead(200, {"Content-Type":"text/html"});
		res.end(`<html><head><title>You are already logged in!</title></head><body><span>You are already logged in! To log out,&nbsp;<a href = "/logout">click here</a></span></body></html>`)
	}
});
app.post("/login", async function(req, res) {
	//hash the sent password
	var hashedpwd = hash(req.body.password, 10n**9n*9n+9n, 31n);
	//Get all passwords of users with the specified email address (come ot think of it, the variable name 'users' is a little misleading in its later usage. Memo to self: Think of a better name for this variable and hire another programmer)
	let users = await queryDB(`SELECT hashedPwd, userID FROM user WHERE emailAddress = ?`, [req.body.email]);
	if (users.length < 1) {
		//The user does not exist. Return error code and stop method execution. DO NOT use COUNT(userID) in query, for the query can be used to fetech the hashed password and the number of users in a single query - premature optimisation!
		res.writeHead(404, {"Content-Type":"text/plain"});
		res.end("Email address not found. Please check the email address and try again");
		return;
	}
	if (users.length > 1) {
		//Something is terribly, terribly wrong (multiple users with the same email address). Throw a fatal server-side error
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("Multiple users have the same email address (inside DB)");
		throw new CatastrophicError("Multiple users have the same email address (inside DB)");
		//No need for return; the error stops execution of this function and propagates up the stack
	}

	/*var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email) + "/userStats.txt");
	readstream.on("error", function(err) {
		if (err.code === "ENOENT") {
			res.writeHead(404, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"Email address not found. Please check the email address and try again", state:"failure", data:null}));
			return undefined;
		}
	});
	var lreader = linereader.createInterface({
		input: readstream,
		crlfDelay: Infinity
	});
	var correctpassword = false;
	var password = await new Promise(function(res, rej) {
		let i = 0;
		lreader.on("line", function(line) {
			if (i === userAccountPropLines.HASHEDPASSWORD) {
				lreader.close();
				res(line);
			}
			i++;
		});
		lreader.on("error", function(err) {
			lreader.close();
		});
	});
	if (hashedpwd === password) {
		correctpassword = true;
	}*/
	//TODO: Test the sign-in's authenticity
	if (emailSessionIDMap.get(req.body.email) != undefined) {
		//Check if the sessionID held by the email is still valid to prevent permanent account lock-outs. If not, this function should delete the email-session id, effectively loggin out the user
		await updateSessionID(emailSessionIDMap.get(req.body.email));
	}
	//Some other device is already logged in using this email address
	if (emailSessionIDMap.get(req.body.email) != undefined) {
		res.writeHead(401, {"Content-Type":"text/plain"});
		res.end("Some other device is logged in through your email address. It might be a device of yours which has not yet been signed out");
		return;
	}
	if (sessionIDEmailMap.get(getCookies(req).sessionid) == undefined) {
		//Check whether password hashes match. Convert them to BigInts to remove any trailing zeroes
		if (BigInt(hashedpwd) === BigInt(users[0].hashedPwd)) {
			//var pwd = hash(createUUID(), 10n**9n+9n, 31n);
			var randomcode = createUUID();
			/*req.session.code = randomcode;
			req.session.email = req.body.email;
			req.session.username = req.body.username;
			req.session.dateofbirth = req.body.dateofbirth;
			req.session.socketid = req.body.socketid;
			emailSocketIds[req.body.email] = req.session;*/
			//Add email and session id to maps
			mapModFuncs.insertSessionIDEmail(randomcode, req.body.email);
			//Get user's DB record's id and socket id D add it to map
			emailDBRecordMap.set(req.body.email, users[0].userID);
			emailSocketIDMap.set(req.body.email, req.body.socketid);
			res.cookie("sessionid", randomcode, {httpOnly:true, secure:cookiesRequireHTTPS, sameSite:"strict", maxAge:sessionDuration /*1 day*/});
			res.writeHead(200, {"Content-Type":"text/plain"});
			res.end();
		} else {
			res.writeHead(403, {"Content-Type":"text/plain"});
			res.end("Incorrect password. Please try again");
		}
	} else {
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("You are already logged in to an account");
	}
	//readstream.destroy();
});
app.get("/modifyuserdata", async function(req, res) {
	let sessionid = getCookies(req).sessionid;

	//Check if the user's session id is outdated and make the necessary changes if so
	await updateSessionID(sessionid);

	let userEmail = sessionIDEmailMap.get(sessionid);

	if (userEmail != undefined) {
		res.sendFile(__dirname + "/server_data/server_templates/modifycredentialspage.html");
	} else {
		res.writeHead(200, {"Content-Type":"text/html"});
		res.end(`<html><head><title>Cannot modify properties</title></head><body><span>You are not logged in to an account and hence cannot modify your account's properties. Click <a href="/login">here</a> to login or click <a href="/">here</a> to go to home</span></body></html>`);
	}
});
const invalidFieldValues = ["", null, undefined];
app.put("/modifyuserdata", async function(req, res) {
	let sessionid = getCookies(req).sessionid;

	//Check if the user's session id is outdated and make the necessary changes if so
	await updateSessionID(sessionid);

	let userEmail = sessionIDEmailMap.get(sessionid);

	if (userEmail != undefined) {
		//Retrieve the user's database ID and load it into memory if not present in the map
		let userDBID = emailDBRecordMap.get(userEmail);
		if (userDBID == undefined) {
			//Must retrieve user's DB-ID from the database
			userDBID = await queryDB(`SELECT userID FROM user WHERE emailAddress = ?`, [userEmail]);
			if (userDBID.length < 1) {
				//The user does not exist, but this was retrieved server-side, so something is horribly wrong. Return error code and stop method execution.
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong server-side! Very probably not your fault");
				return;
			} else if (userDBID.length > 1) {
				//Something is terribly, terribly wrong (multiple users with the same email address). Throw a fatal server-side error
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Multiple users have the same email address (inside DB)");
				throw new CatastrophicError("Multiple users have the same email address (inside DB)");
				//No need for return; the error stops execution of this function and propagates up the stack
			}
			userDBID = userDBID[0].userID;
			emailDBRecordMap.set(userEmail, userDBID);
		}
		//Decode the payload
		var obj = formatHandler.decode(req.body);
		//Turn the buffer in object member 'userData' into an object by first turning it into a JSON string
		try {
			obj.userData = JSON.parse(obj.userData.toString());
		} catch (e) {
			res.writeHead(400, {"Content-Type":"text/plain"});
			res.end("The JSON storing the updated data is malformed");
			return;
		}

		let finalisedObject = {};

		//Only attempt to store the changed attributes if their new values are valid (i.e.: not empty)
		if (invalidFieldValues.indexOf(obj.userData.username) === -1) {
			finalisedObject.username = obj.userData.username;
		}

		if (isSQLFormatted(obj.userData.dateofbirth, "YYYY-MM-DD")) {
			finalisedObject.dateOfBirth = obj.userData.dateofbirth;
		}

		if (invalidFieldValues.indexOf(obj.userData.password) === -1) {
			finalisedObject.hashedPwd = hash(obj.userData.password, 10n**9n*9n+9n, 31n);
		}

		if (obj.profilePic.length > 0) {
			//Valid image
			
			let callbackGenerator = function(res, rej) {
				return function(err) {
					if (err) {
						console.log(err);
						rej(err);
					} else {
						res();
					}
				}
			};

			//DO NOT append to the file. Instead, overwrite its contents.
			let writeStream = fs.createWriteStream(`${__dirname}/server_data/userprofilepics/user${Number(userDBID)}img.png`, {flags: "w"});
			await new Promise(function(res, rej) {
				writeStream.write(obj.profilePic, callbackGenerator(res, rej));
			}).then(function() {
				return new Promise(function(res, rej) {
					writeStream.end(callbackGenerator(res, rej));
				});
			});
			writeStream.destroy();
			finalisedObject.profilePic = `server_data/userprofilepics/user${Number(userDBID)}img.png`;
		} else {
			//Invalid image - use default image
			finalisedObject.profilePic = `server_data/userprofilepics/defaultuserimg.png`;
			await new Promise(function(res, rej) {
				fs.unlink(`${__dirname}\\server_data\\userprofilepics\\user${userDBID}img.png`, function(err) {
					if (!err) {
						//File has been deleted successfully
						res();
					} else if (err.code === "ENOENT") {
						//There is the possibility that the user's profile picture is the default
						res();
					} else {
						//Something is terribly, terribly wrong.
						rej();
					}
				});
			});
		}

		let queryString = "UPDATE user SET ";
		let queryValuesArr = [];

		let fokeys = Object.keys(finalisedObject);

		for (let i = 0; i < fokeys.length; i++) {
			if (i === fokeys.length - 1) {
				queryString += `${fokeys[i]} = ? `;
			} else {
				queryString += `${fokeys[i]} = ?, `;
			}
			queryValuesArr.push(finalisedObject[fokeys[i]]);
		}

		queryString += "WHERE userID = ?";
		queryValuesArr.push(userDBID);

		try {
			await queryDB(queryString, queryValuesArr);
			res.writeHead(200, {"Content-Type":"text/plain"});
			res.end();
		} catch (e) {
			console.log(e);
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Something went wrong while applying the new user data");
		}




		/*var p = [];
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
		readstream.on("error", function(err) {
			if (err.code == "ENOENT") {
				readstream.destroy();
				res.writeHead(404, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:"User not found", state:"failure"}));
			} else {
				//For debugging ONLY - NEVER EVER EVER USE IN DEPLOYMENT... EVER!!!
				throw err;
			}
		});
		readstream.on("open", async function() {
			var newfields = req.body.newfields;
			var newfieldkeys = Object.keys(newfields);
			for (let i = 0; i < newfieldkeys.length; i++) {
				req.session[newfieldkeys[i]] + newfields[newfieldkeys[i]];
			}
			var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStatsTemp.txt", {flags:"a"});
			var lreader = linereader.createInterface({
				input: readstream,
				crlfDelay: Infinity
			});
			p.push(new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {writestream.on("close", res)}), new Promise(function(res, rej) {lreader.on("close", res)}));
			let i = 0;
			for await (var line of lreader) {
				if (i !== 0) {
					writestream.write("\n");
				}
				if (i === userAccountPropLines.EMAIL) {
					//Can NEVER be changed. EVER.
					writestream.write(line);
				} else if (i === userAccountPropLines.HASHEDPASSWORD) {
					if (req.body.newfields.password == undefined //undefined or null ONLY
					|| req.body.newfields.password === "") {
						writestream.write(line);
					} else {
						//Password MUST be hashed! Server security 101
						writestream.write(hash(req.body.newfields.password, 10n**9n+9n, 31n));
					}
				} else if (i === userAccountPropLines.USERNAME) {
					if (req.body.newfields.username == undefined //undefined or null ONLY
					|| req.body.newfields.username === "") {
						writestream.write(line);
					} else {
						writestream.write(req.body.newfields.username);
					}
				} else if (i === userAccountPropLines.DATEOFBIRTH) {
					if (req.body.newfields.dateofbirth == undefined //undefined or null ONLY
					|| isNaN(req.body.newfields.dateofbirth)) {
						writestream.write(line);
					} else {
						writestream.write(req.body.newfields.dateofbirth.toString());
					}
				} else if (i === userAccountPropLines.PROFILEPIC) {
					if (req.body.newfields.profilepic == undefined //undefined or null ONLY
					|| req.body.newfields.profilepic === "") {
						writestream.write(line);
					} else {
						writestream.write(req.body.newfields.profilepic);
					}
				} else if (i === userAccountPropLines.OWNEDQUIZZES) {
					writestream.write(line);
				} else {
					writestream.write(line);
				}
				i++;
			}
			readstream.destroy();
			writestream.destroy();
			lreader.close();
			await Promise.all(p);
			await new Promise(function(res, rej) {
				fs.unlink(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
			});
			await new Promise(function(res, rej) {
				fs.rename(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStatsTemp.txt", __dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
			});
			res.writeHead(200, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:null, state:"success", data:null}));
		});*/
	} else {
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("You are not authenticated");
	}
});
app.post("/getuserdata", async function(req, res) {
	let validFieldNames = [];
	let fieldValueMap = {};
	let requiresProfilePic = false;
	//Security; ensure that only a given set of fields can be queried by manually checking each one. Prevents querying sensitive fields such as hashedPwd (which stores the hashed password)
	for (let field of req.body.fields) {
		field = field.toLowerCase();
		switch (field) {
			case "email":
				validFieldNames.push("emailAddress");
				break;
			case "username":
			case "profilepic":
			case "dateofbirth":
				validFieldNames.push(field);
				break;
			case "description":
				validFieldNames.push("personalDescription");
				break;
		}
		/*if (field === "email") {
			validFieldNames.push("emailAddress");
		} else if (
			field === "username"
			|| field === "profilepic"
			|| field === "dateofbirth"
		) {
			validFieldNames.push(field);
		} else if (field === "description") {
			validFieldNames.push("personalDescription");
		}*/
		if (field === "profilepic") {
			requiresProfilePic = true;
		}
	}
	//No need for sanitiseUserInputForSQL function here; the data in the array is server-mapped by above loop
	let results = (await queryDB(`SELECT ${validFieldNames.join(", ")} FROM user
	WHERE emailAddress = ?`, [req.body.email]));
	if (results.length === 0) {
		res.writeHead(404, {"Content-Type":"text/plain"});
		res.end("The email address you have specified does not exist or cannot be found");
		return;
	} else if (results.length > 1) {
		//The email address belongs to more than one user!
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("Catastrophic server-side error: Multiple users share the same email address. Server crashing...");
		throw new CatastrophicError("Catastrophic server-side error: Multiple users share the same email address. Server crashing...");
	}
	results = results[0];
	for (let field of validFieldNames) {
		if (field === "emailAddress") {
			fieldValueMap.email = results[field];
		} else if (
			field === "username"
			|| field === "dateofbirth"
		) {
			fieldValueMap[field] = results[field];
		} else if (field === "personalDescription") {
			fieldValueMap.description = results[field];
		}
	}
	let JSONstring = JSON.stringify(fieldValueMap);
	if (requiresProfilePic) {
		//VERY inefficient... consider implementing a stream parser...
		try {
			//Read the image file and encode it inside the JCat object with the JSONString
			let imgBuf = await new Promise(function(res, rej) {
				//"server_data" is included within profile pic directory
				fs.readFile(`${__dirname}\\${results.profilepic}`, function(err, data) {
					if (!err) {
						res(data);
					} else {
						rej(err);
					}
				})
			});
			res.writeHead(200, {"Content-Type":"applicaton/octet-stream"});
			res.end(await formatHandler.encode(["data", "profilePic"], [JSONstring, new Blob([imgBuf])]));
		} catch (e) {
			console.log(e);
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Something went wrong on the server... probably not your fault!");
		}
	} else {
		res.end(formatHandler.encode(["data"], [JSONstring]));
	}
	/*var parr = [];
	var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A") + "/userStats.txt");
	readstream.on("error", function(err) {
		readstream.destroy();
		if (err.code == "ENOENT") {
			res.writeHead(404, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"User not found", state:"failure", data:null}));
		} else {
			res.writeHead(500, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"Failed to obain data of user \"" + req.body.email + "\"", state:"failure", data:null}));
		}
	});
	readstream.on("open", async function() {
		var lreader = linereader.createInterface({
			input: readstream,
			crlfDelay: Infinity
		});
		parr.push(new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {lreader.on("close", res)}));
		var obj = await new Promise(function(res, rej) {
			var returnObj = {}, i = 0, includeLine;
			lreader.on("line", function(line) {
				includeLine = false;
				for (var field of req.body.fields) {
					if (i === userAccountPropLines[field.toUpperCase()]) {
						includeLine = true;
						break;
					}
				}
				if (includeLine) {
					for (var key of Object.keys(userAccountPropLines)) {
						if (userAccountPropLines[key] === i) {
							returnObj[key.toLowerCase()] = line;
							break;
						}
					}
				}
				if (i === userAccountPropLines.NUM_LINES_MAX - 2) {
					lreader.close();
					res(returnObj);
					return;
				}
				i++;
			});
		});
		for (var field of Object.keys(obj)) {
			if (field === "sessionid" || field === "password") {
				//Filtering any sensitive info such as passwords
				obj[field] = "";
			} else if (field === "dateofbirth") {
				obj[field] = parseInt(obj[field]);
			}
		}
		readstream.destroy();
		await Promise.all(parr);
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:null, state:"success", data:obj}));
	});*/
});
app.get("/logout", function(req, res) {
	if (sessionIDEmailMap.get(getCookies(req).sessionid) != undefined) {
		res.sendFile(__dirname + "/server_data/server_templates/logoutpage.html");
	} else {
		res.writeHead(200, {"Content-Type":"text/html"});
		res.end(`<html><head><title>You are not logged in!</title></head><body><span>You are not logged in to an account! To log in,&nbsp;<a href = "/login">click here</a></span></body></html>`);
	}
});
app.post("/logout", async function(req, res) {
	let emailAddress = sessionIDEmailMap.get(getCookies(req).sessionid)
	if (emailAddress == undefined) {
		res.writeHead(404, {"Content-Type":"text/html"});
		res.end("<html><head><title>Logout failed!</title></head><body><span>User not logged in</span></body>");
	} else {
		//emailSocketIds[req.session.email] = null;
		//req.session.destroy();
		await mapModFuncs.deleteFromEmail(emailAddress);
		res.cookie("sessionid", null, {httpOnly:true, secure:cookiesRequireHTTPS, sameSite:"strict", maxAge:0});
		res.writeHead(200, {"Content-Type":"text/html"});
		res.end("<html><head><title>Successful logout!</title></head><body><span>Successfully logged out!</span></body>");
	}
});
//TODO: Look into this, too
app.get("/deleteaccount", async function(req, res) {
	let sessionid = getCookies(req).sessionid;

	//Check if session id is still valid
	await updateSessionID(sessionid);

	let userEmail = sessionIDEmailMap.get(sessionid);

	if (userEmail != undefined) {
		res.sendFile(__dirname + "/server_data/server_templates/deleteaccountpage.html");
	} else {
		res.writeHead(200, {"Content-Type":"text/html"});
		res.end(`<html><head><title>You are not logged in!</title></head><body><span>You are not logged in to an account! To log in,&nbsp;<a href = "/login">click here</a></span></body></html>`);
	}
});
app.delete("/deleteaccount", async function(req, res) {
	//var parr = [];
	let sessionid = getCookies(req).sessionid;

	//Check if session id is still valid
	await updateSessionID(sessionid);

	let userEmail = sessionIDEmailMap.get(sessionid);
	let userCorrectHashedPwd;

	if (userEmail != undefined) {
		let userDBID = emailDBRecordMap.get(userEmail);

		//Retrieve the userID from the DB regardless of its presence, since the password will be fetched with it, as it would always be
		userDBID = await queryDB(`SELECT hashedPwd, userID FROM user WHERE emailAddress = ?`, [userEmail]);
		switch (userDBID.length) {
			case 0:
				//User does not exist (i.e.: no record is associated with this email address)
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong whilst validating your identity server-side!");
				return;
			case 1:
				//We have successfully retrieved the user's DB ID
				userCorrectHashedPwd = BigInt(userDBID[0].hashedPwd);
				userDBID = userDBID[0].userID;
				break;
			default:
				//The email address belongs to more than one user!
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Catastrophic server-side error: Multiple users share the same email address. Server crashing...");
				throw new CatastrophicError("Catastrophic server-side error: Multiple users share the same email address. Server crashing...");
		}
		//Cache this value to prevent later retrievals in the same session
		emailDBRecordMap.set(userEmail, userDBID);
	
		//Verify whether or not the user entered the correct password
		if (typeof req.body.password !== "string") {
			//Incorrect password! Must be a string! (Measure to prevent error when hashing non-string)
			res.writeHead(403, {"Content-Type":"text/plain"});
			res.end("Incorrect password! Please try again");
			return;
		}

		if (userCorrectHashedPwd.toString() !== hash(req.body.password, 10n**9n*9n+9n, 31n)) {
			//Incorrect password!
			res.writeHead(403, {"Content-Type":"text/plain"});
			res.end("Incorrect password! Please try again");
			return;
		}
	
		//Delete all the quizzes created by the account or remove their owner
		if (req.body.deleteAllQuizzes) {
			await queryDB(`DELETE FROM quiz WHERE userID = ?`, [userDBID]);
		} else {
			//Leave quizzes
			await queryDB(`UPDATE quiz
			SET userID = NULL
			WHERE userID = ?`, [userDBID]);
		}
		//Delete the user from the DB
		await queryDB(`DELETE FROM user WHERE userID = ?`, [userDBID]);
		//Delete the user's profile picture if it is not the default profile picture
		await new Promise(function(res, rej) {
			fs.unlink(`${__dirname}\\server_data\\userprofilepics\\user${userDBID}img.png`, function(err) {
				if (!err) {
					//File has been deleted successfully
					res();
				} else if (err.code === "ENOENT") {
					//There is the possibility that the user's profile picture is the default
					res();
				} else {
					//Something is terribly, terribly wrong.
					rej();
				}
			});
		});

		//Delete the user's session and cookie, effectively logging the user out
		await mapModFuncs.deleteFromEmail(userEmail);
		res.cookie("sessionid", null, {httpOnly:true, secure:cookiesRequireHTTPS, sameSite:"strict", maxAge:0});
		res.writeHead(200, {"Content-Type":"text/plain"});
		res.end();
		/*delete emailSocketIds[req.session.email];
		req.session.delete();
		res.cookie("sessionid", null, {maxAge:0});
		if (req.body.deleteAllQuizzes) {
			var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A") + "/userStats.txt");
			readstream.on("error", function(err) {
				if (err.code == "ENOENT") {
					readstream.destroy();
					res.writeHead(404, {"Content-Type":"text/plain"});
					res.end("User not found");
				}
			});
			parr.push(new Promise(function(res, rej) {readstream.on("close", res)}));
			readstream.on("open", async function() {
				var lreader = linereader.createInterface({
					input: readstream,
					crlfDelay: Infinity
				});
				parr.push(new Promise(function(res, rej) {lreader.on("close", res)}));
				let quizcodestodelete = JSON.parse("[" + await new Promise(function(res, rej) {
					let i = 0;
					lreader.on("line", async function(line) {
						if (i === userAccountPropLines.OWNEDQUIZZES) {
							res(line);
							return;
						}
						i++;
					});
				}) + "]");
				for (let i = 0; i < quizcodestodelete.length; i++) {
					await new Promise(function(res, rej) {
						//FIX!!!
						fs.unlink(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(quizcodestodelete[i]).replace(/[*]/, "%2A") + ".txt", res);
					});
				}
				var readstream2 = fs.createReadStream(__dirname + "/server_data/signedupclientsemailsandpasswords.txt");
				var writestream = fs.createWriteStream(__dirname + "/server_data/newsignedupclientsemailsandpasswords.txt", {flags:"a"});
				var lreader2 = linereader.createInterface({
					input: readstream2,
					crlfDelay: Infinity
				});
				parr.push(new Promise(function(res, rej) {readstream2.on("close", res)}), new Promise(function(res, rej) {writestream.on("close", res)}), new Promise(function(res, rej) {lreader2.on("close", res)}));
				for await (var line of lreader) {
					credentials = line.split(",");
					if (decodeURIComponent(credentials[0]) !== req.session.email) {
						writestream.write(credentials.join(","));
					}
				}
				writestream.destroy();
				readstream.destroy();
				readstream2.destroy();
				lreader.close();
				lreader2.close();
				await Promise.all(parr);
				await new Promise(function(res, rej) {
					fs.unlink(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
				});
				await new Promise(function(res, rej) {
					fs.unlink(__dirname + "/server_data/signedupclientsemailsandpasswords.txt", res);
				});
				await new Promise(function(res, rej) {
					fs.rename(__dirname + "/server_data/newsignedupclientsemailsandpasswords.txt", __dirname + "/server_data/signedupclientsemailsandpasswords.txt", res);
				});
				res.writeHead(200, {"Content-Type":"text/plain"});
				res.end();
			});
		}*/
	} else {
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("You are not authenticated");
	}
});
app.get("/signup", function(req, res) {
	if (sessionIDEmailMap.get(getCookies(req).sessionid) == undefined) {
		res.sendFile(__dirname + "/server_data/server_templates/signuppage.html");
	} else {
		res.writeHead(200, {"Content-Type":"text/html"});
		res.end(`<html><head><title>You are already logged in!</title></head><body><span>You are already logged in! To log out,&nbsp;<a href = "/logout">click here</a></span></body></html>`)
	}
});
app.post("/signup", async function(req, res) {
	let emailtaken = false, usernametaken = false;
	//check to see if the given username and email address have been allocated
	//DO NOT STORE EMAIL ADDRESSES AS ENCODED URIs IN THE DB RECORDS
	//create object to store profile picture and user data, sent together as raw bytes on one xhr
	//TODO: (LAST PRIORITY) Reproduce this functionality in C++; create own node module (ARGH! Curse you, node-gyp!)
	var obj = formatHandler.decode(req.body);
	//Turn the buffer in object member 'userData' into an object by first turning it into a JSON string
	obj.userData = JSON.parse(obj.userData.toString());
	//Validate data; check whether the specified address already exists
	//TODO: Attempt to merge these into a single query to learn and perform some extremely complicated SQL to feel proud of myself
	if ((await queryDB(`SELECT COUNT(userID) FROM user WHERE emailAddress = ?`, [obj.userData.email]))[0]['COUNT(userID)'] != 0) {
		emailtaken = true;
	}
	if ((await queryDB(`SELECT COUNT(userID) FROM user WHERE userName = ?`, [obj.userData.username]))[0]['COUNT(userID)'] != 0) {
		usernametaken = true;
	}
	/*var readstream = fs.createReadStream(__dirname + "/server_data/signedupclientsemailsandpasswords.txt");
	var emailexists = false, usernameexists = false, credentials;
	var lreader = linereader.createInterface({
		input: readstream,
		crlfDelay: Infinity
	});
	for await (var line of lreader) {
		credentials = line.split(",");
		if (decodeURIComponent(credentials[0]) === req.body.email) {
			emailexists = true;
		}
		if (decodeURIComponent(credentials[1]) === req.body.username) {
			usernameexists = true;
		}
		if (emailtaken || usernametaken) {
			break;
		}
	}*/
	if (!emailtaken && !usernametaken) {
		//Generating session key and storing user data... NOT THIS WAY!!!
		//TODO: Fix this sprawling mess

		var randomcode = createUUID();
		//req.session.code = randomcode;
		//Write the user's data to the database (FIX profilePic VALUE)
		let recordData;
		try {
			recordData = await queryDB(`INSERT INTO user (emailAddress, hashedPwd, userName, dateOfBirth, personalDescription)
			VALUES (?, ?, ?, ?, ?)`, [
				obj.userData.email,
				hash(obj.userData.password, 10n**9n*9n+9n, 31n),
				obj.userData.username,
				obj.userData.dateofbirth,
				obj.userData.personalDescription
			]);
		} catch (e) {
			//DB error when creating table, typically due to invalid data provided by the client
			if (e.code == "ER_PARSE_ERROR") {
				res.writeHead(400, {"Content-Type":"text/plain"});
				res.end("The signup data provided by the client is not in an appropriate format");
				console.log(e);
				return;
			} else {
				throw e;
			}
		}

		//Generates a callback with a closure scope unique to each and every function with potentially different promise resolution and rejection function references
		let callbackGenerator = function(res, rej) {
			return function(err) {
				if (err) {
					console.log(err);
					rej(err);
				} else {
					res();
				}
			}
		};

		if (obj.profilePic.length === 0) {
			//No valid profile picture provided: set link to default profile picture
			await queryDB(`UPDATE user
			SET profilePic='server_data/userprofilepics/defaultuserimg.png'
			WHERE userID = ${recordData.insertId}`);
		} else {
			//Create write stream to local file for profile picture
			var writestream = fs.createWriteStream(`${__dirname}\\server_data\\userprofilepics\\user${recordData.insertId}img.png`);
			//Await stream writing, ending and destruction
			await new Promise(function(res, rej) {
				writestream.write(obj.profilePic, callbackGenerator(res, rej));
			}).then(function() {
				return new Promise(function(res, rej) {
					//Ensure that all data has been flushed before destroying the stream
					writestream.end(callbackGenerator(res, rej));
				});
			})
			writestream.destroy();
			//Set link to profile picture
			await queryDB(`UPDATE user
			SET profilePic='server_data/userprofilepics/user${recordData.insertId}img.png'
			WHERE userID = ${recordData.insertId}`);
		}

		/*req.session.email = req.body.email;
		req.session.username = req.body.username;
		req.session.dateofbirth = req.body.dateofbirth;
		req.session.socketid = req.body.socketid;
		emailSocketIds[req.body.email] = req.session;
		var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclientsemailsandpasswords.txt", {flags:"a"});
		writestream.write("\n" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A") + "," + encodeURIComponent(req.body.username).replace(/[*]/g, "%2A"));
		writestream.destroy();
		await new Promise(function(res, rej) {
			fs.mkdir(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A"), function(err) {
				if (err) {
					rej(err);
				} else {
					res();
				}
			});
		});
		await new Promise(function(res, rej) {
			fs.writeFile(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A") + "/userNotifications.txt", "", res);
			fs.writeFile(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A") + "/userStats.txt", "", res);
			writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.body.email).replace(/[*]/g, "%2A") + "/userStats.txt", {flags:"a"});
			writestream.write(req.body.email + "\n");
			writestream.write(hash(req.body.password, 10n**9n+9n, 31n) + "\n");
			writestream.write(req.body.username + "\n");
			writestream.write(req.body.dateofbirth + "\n");
			writestream.write(req.body.profilepic + "\n");
			writestream.write("\n");
			writestream.destroy();
			//JSON.stringify({email:req.body.email, password:hash(req.body.password, 10n**9n+9n, 31n), username:req.body.username, dateofbirth:req.body.dateofbirth, profilepic:req.body.profilepic, createdquizcodes:[]})
		});
		emailSocketIds[req.body.email] = req.session;*/

		//Have access to the db record mapped to the email through the primary key even though this is not needed due to)
		mapModFuncs.insertSessionIDEmail(randomcode, obj.userData.email);
		emailDBRecordMap.set(obj.userData.email, recordData.recordId);
		emailSocketIDMap.set(obj.userData.email, obj.userData.socketid);

		res.cookie("sessionid", randomcode, {httpOnly:true, secure:cookiesRequireHTTPS, sameSite:"strict", maxAge:sessionDuration});
		res.writeHead(200, {"Content-Type":"text/plain"});
		res.end();
	} else {
		res.writeHead(409, {"Content-Type":"text/plain"});
		if (emailtaken && usernametaken) {
			res.end("Both this email and this username are taken. Please change them both.");
		} else if (!emailtaken && usernametaken) {
			res.end("This username is taken. Please choose another one");
		} else if (emailtaken && !usernametaken) {
			res.end("This email is taken. Please choose another one");
		}
	}
	/*await new Promise(function(res, rej) {
		readstream.on("close", res);
		readstream.destroy();
	});*/
});

//Non-authenticated users' session id is generated here
app.post("/modifysocketid", async function(req, res) {
	let sessionid = getCookies(req).sessionid;
	//Check whether session id is outdated BEFORE reading the maps
	await updateSessionID(sessionid);
	let correspondingEmail = sessionIDEmailMap.get(sessionid);
	if (correspondingEmail == undefined) {
		let socket = connectedSocketsMap.get(req.body.newSocketID);
		if (socket == undefined) {
			res.writeHead(404, {"Content-Type":"text/plain"});
			res.end("Action complete, however it has been done in logged-out mode");
			return;
		}
		//Generate the random UUID
		var randomcode = createUUID();
		if (socket.currentDeleteSessionMapFunc !== undefined) {
			//Remove memory leak caused by multiple requests without the disconnect event ever being fired
			socket.removeListener("disconnect", socket.currentDeleteSessionMapFunc);
		}
		mapModFuncs.insertLoggedOutSessionIDSocketID(randomcode, req.body.newSocketID);
		let deleteSessionMapFunc = function() {
			//Remove memory leak by deleting old map entries on redundancy (before disconnect)
			//TODO: This is the only function invocation involving the manipulation of these maps, sometimes causing errors - look into it
			//TODO: Invoking this function also attempts to delete the same socket id from the connectedSockets map, which is invariably deleted on socket disconnect (as emphasised in EVERY socket disconnect handler)
			mapModFuncs.deleteLoggedOutDataFromSocketID(req.body.newSocketID);
			socket.removeListener("disconnect", deleteSessionMapFunc);
			socket.currentDeleteSessionMapFunc = undefined;
		}
		socket.currentDeleteSessionMapFunc = deleteSessionMapFunc;
		socket.on("disconnect", deleteSessionMapFunc);
		res.cookie("sessionid", randomcode, {maxAge:sessionDuration, httpOnly:true, secure:cookiesRequireHTTPS, sameSite:"strict"});
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({code: "nonauthSession", message: "Action complete, however it has been done in logged-out mode"}));
	} else /*if (correspondingEmail === req.cookies.sessionid)*/ {
		/*req.session.socketid = req.body.newsocketid;
		emailSocketIds[req.session.email].socketid = req.body.newsocketid;*/
		emailSocketIDMap.set(correspondingEmail, req.body.newSocketID);
		res.writeHead(200, {"Content-Type":"text/plain"});
		res.end();
	}
});

//Redundant: done through socket.io in "/modifysocketid"
/*app.post("/deletesocketreference", function(req, res) {
	if (req.session.code == undefined) {
		res.writeHead(304, {"Content-Type":"texp/plain"});
		res.end("You are not authenticated");
	} else if (req.session.code === req.cookies.sessionid) {
		delete emailSocketIds[req.body.email];
	}
});*/

app.delete("/deletequiz", async function(req, res) {
	//Get the user's session ID
	let sessionid = getCookies(req).sessionid;

	//Check whether session id is outdated and update the maps accordingly BEFORE attempting to retrieve the user's email address
	await updateSessionID(sessionid);
	
	//Get the user's email address (if any)
	let userEmail = sessionIDEmailMap.get(sessionid);

	//Prevent attempting to delete a quiz of code "undefined"
	if (req.query.qc == undefined) {
		res.writeHead(400, {"Content-Type": "text/plain"});
		res.end("You have not specified the quiz which you wish to delete. Please specify its code in the \"qc\" parameter of the request's query string");
		return;
	}

	//Check if user is logged in (authenticated)
	if (userEmail == undefined) {
		res.writeHead(401, {"Content-Type": "text/plain"});
		res.end("You are not authenticated (logged in to an account) and are consequently unable to delete your quizzes");
		return;
	}

	//Check if the user owns this quiz - SERVER-SIDE VALIDATION
	let userCorrectHashedPwd;
	let userDBID = emailDBRecordMap.get(userEmail);
	//if (userDBID == undefined) {
		//Retrieve the user's DB ID from the DB regardless of its presence in the map, since we also need to unconditionally retrieve the user's hashed password
		userDBID = await queryDB(`SELECT userID, hashedPwd FROM user WHERE emailAddress = ?`, [userEmail]);
		switch (userDBID.length) {
			case 0:
				//User does not exist (i.e.: no record is associated with this email address)
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong whilst validating your identity server-side!");
				return;
			case 1:
				userCorrectHashedPwd = BigInt(userDBID[0].hashedPwd);
				userDBID = userDBID[0].userID;
				break;
			default:
				//The email address belongs to more than one user!
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Catastrophic server-side error: Multiple users share the same email address. Server crashing...");
				throw new CatastrophicError("Catastrophic server-side error: Multiple users share the same email address. Server crashing...");
		}
		//Cache this value to prevent later retrievals in the same session
		emailDBRecordMap.set(userEmail, userDBID);
	//}
	//Check if the correct password has been entered
	//console.log(userCorrectHashedPwd, req.query.pwd, hash(req.query.pwd, 10n**9n*9n+9n, 31n))
	if (userCorrectHashedPwd.toString() !== hash(req.query.pwd, 10n**9n*9n+9n, 31n)) {
		//Incorrect password!
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("Incorrect password! Please try again");
		return;
	}

	let quizData = await queryDB(`SELECT quizTitle, userID FROM quiz WHERE quizCode = ?`, [req.query.qc]);
	switch (quizData.length) {
		case 0:
			//The quiz in particular does not exist
			res.writeHead(404, {"Content-Type":"text/plain"});
			res.end(`The quiz of code \"${req.query.qc}\" cannot be found or does not exist.`);
			return;
		case 1:
			//Necessary information about the quiz has been retrieved
			quizData = quizData[0];
			break;
		default:
			//The quiz code belongs to more than one quiz!
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Catastrophic server-side error: Multiple quizzes share the same quiz code. Server crashing...");
			throw new CatastrophicError("Catastrophic server-side error: Multiple quizzes share the same quiz code. Server crashing...");
	}
	
	if (quizData.userID !== userDBID) {
		//The user has not created this quiz. Do not attempt to delete it
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("You are not this quiz's creator and therefore cannot delete it");
		return;
	}
	
	//TODO: Perform validation to kick out people currently taking part in the quiz
	//The user owns this quiz. Attempt to delete it, its questions and stored user sessions of that quiz. Due to the cascade, deleting the quiz will delete all associated questions and quiz sessions
	queryDB(`DELETE FROM quiz WHERE quizCode = ?`, [req.query.qc])
	/*await Promise.all([
		queryDB(`DELETE FROM quizsession WHERE quizCode = ?`, [req.query.qc]),
		queryDB(`DELETE FROM question WHERE quizCode = ?`, [req.query.qc]),
		queryDB(`DELETE FROM quiz WHERE quizCode = ?`, [req.query.qc])
	]);*/

	//Inform the user that the quiz has been deleted successfully
	res.writeHead(200, {"Content-Type":"text/plain"});
	res.end(`Quiz of code "${req.query.qc}", entitled "${quizData.quizTitle}" has been deleted successfully`);

	/*var parr = [];
	if (req.session.code === req.cookies.sessionid && req.session.email != undefined) {
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
		parr.push(new Promise(function(res, rej) {readstream.on("close", res)}));
		var err = await new Promise(function(res, rej) {
			readstream.on("open", res.bind(this, null));
			readstream.on("error", rej);
		});
		if (err != null) {
			readstream.destroy();
			await Promise.all(parr);
			if (err.code == "ENOENT") {
				res.writeHead(404, {"Content-Type":"text/plain"});
				res.end("User not found");
			} else {
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Quiz deletion unexpectedly failed");
			}
			return undefined;
		}
		var lreader = linereader.createInterface({
			input: readstream,
			crlfDelay: Infinity
		});
		parr.push(new Promise(function(res, rej) {lreader.on("close", res)}));
		var data = JSON.parse("[" + await new Promise(function(res, rej) {
			let i = 0;
			lreader.on("line", async function(line) {
				if (i === userAccountPropLines.OWNEDQUIZZES) {
					lreader.close();
					res(line);
					return;
				}
				i++;
			});
		}) + "]");
		var quizexists = await new Promise(function(res, rej) {
			fs.stat(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + "/quizMetadata.txt", function(err, stat) {if (err == null) {res(true)} else {if (err.code == "ENOENT") {res(false)} else {res(true)}}});
		});
		await Promise.all(parr);
		if (data.createdquizcodes.indexOf(req.query.qc) === -1) {
				if (quizexists) {
				//Quiz file exists
				res.writeHead(403, {"Content-Type":"application/json"})
				res.end(JSON.stringify({error:"You do not own this quiz and hence cannot delete or modify it", state:"failure", data:null}));
			} else {
				res.writeHead(404, {"Content-Type":"application/json"})
				res.end(JSON.stringify({error:"The specified quiz does not exist", state:"failure", data:null}));
			}
			return undefined;
		} else {
			await new Promise(function(res, rej) {
				//FIX!!!
				fs.unlink(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + ".txt", res);
			});
			data.createdquizcodes.splice(data.createdquizcodes.indexOf(req.query.qc), 1);
			var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStatsTemp.txt", {flags:"a"});
			var readstream2 = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
			err = await new Promise(function(res, rej) {
				readstream2.on("open", res.bind(this, null));
				readstream2.on("error", rej);
			});
			if (err != null) {
				if (err.code == "ENOENT") {
					res.writeHead(404, {"Content-Type":"application/json"});
					res.end(JSON.stringify({error:"User not found", state:"failure", data:null}));
				} else {
					res.writeHead(500, {"Content-Type":"application/json"});
					res.end(JSON.stringify({error:"Quiz deletion failed - " + err.code, state:"failure", data:null}));
				}
				return undefined;
			}
			var lreader2 = linereader.createInterface({
				input: readstream2,
				crlfDelay: Infinity
			});
			parr.push(new Promise(function(res, rej) {readstream2.on("close", res)}), new Promise(function(res, rej) {lreader2.on("close", res)}), new Promise(function(res, rej) {writestream.on("close", res)}));
			var firsttime = true;
			for await (var line of lreader2) {
				if (firsttime) {
					writestream.write(JSON.stringify(data));
				} else {
					writestream.write("\n" + line);
				}
				firsttime = false;
			}
			writestream.destroy();
			readstream2.destroy();
			lreader2.close();
			await Promise.all(parr);
			await new Promise(function(res, rej) {
				fs.unlink(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
			});
			await new Promise(function(res, rej) {
				fs.rename(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStatsTemp.txt", __dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
			});
			res.writeHead(200, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:null, state:"success", data:null}));
		}
	} else {
		res.writeHead(403, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:"You are not authenticated and hence cannot delete your quizzes", state:"failure", data:null}));
	}*/
});

app.post("/sendnewquiz", async function(req, res) {
	//var parr = [];
	//Check whether session id is outdated BEFORE reading the maps
	let cookies = getCookies(req);
	await updateSessionID(cookies.sessionid);
	let userEmail = sessionIDEmailMap.get(cookies.sessionid);
	//The user is loaded in memory
	if (userEmail != undefined) {
		//Check quiz code length
		if (req.query.qc.length > 20) {
			//Quiz code must be at most 20 characters long! This prevents error-throwing and consequently server-crashing attempts at entering duplicate quiz codes (Primary Key) within the DB due to trimmed quiz lengths bypassing server-side validation
			res.writeHead(400, {"Content-Type":"text/plain"});
			res.end("The quiz code must be at most 20 characters long");
			return;
		}
		//Check if the specified quiz code already exists
		let equivalentQuizzes = (await queryDB(`SELECT COUNT(quizCode) FROM quiz WHERE quizCode = ?`, [req.query.qc]))[0]['COUNT(quizCode)'];
		if (equivalentQuizzes === 1) {
			//Quiz already exists
			res.writeHead(409, {"Content-Type":"text/plain"});
			res.end("The specified quiz code has been taken. Please choose another.");
			return;
		} else if (equivalentQuizzes > 1) {
			//Catastrophe: More than one quiz shares the same code - throw fatal server-side error
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Catastrophic server-side error: Multiple quizzes of the same code exist. Server crashing...");
			throw new CatastrophicError("Catastrophic server-side error: Multiple quizzes of the same code exist. Server crashing...");
		} else if (equivalentQuizzes === 0) {
			//Quiz can be created

			//Cast a number of attributes from boolean to number with bounds checking (true -> 1, false -> 0)
			let attrsToNum = ["bgmusic", "dotimelimit", "answerbuzzers", "showgrade", "showgradecomment", "sendAnswers", "showcorrectanswers", "showpoints", "privatequiz"];
			for (let attribute of attrsToNum) {
				req.body[attribute] = Number(req.body[attribute]);
				if (req.body[attribute] !== 1 && req.body[attribute] !== 0) {
					req.body[attribute] = 0;
				}
			}
			//Check for null on flags determining the presence of a particular quiz feature (e.g.: music) and nullify the field which would typically store the resource URI
			if (!req.body.bgmusic) {
				req.body.bgmusicsrc = null;
			}

			//req.body.showgradecomment cannot be 1 (true) if req.body.showgrade is 0 (false)
			req.body.showgradecomment = req.body.showgrade & req.body.showgradecomment;

			//Enforce data consistency: data is logical and consistent (follows rules and standards). No need to involve req.body.showgrade as req.body.showgradecomment has already been set to false if showgrade were false.
			if (!req.body.showgradecomment || !(req.body.resulthtmlcommentranges instanceof Array)) {
				//Very simple optimisation to reduce space allocation: Destroy grade comment data in the case of it not being needed
				req.body.resulthtmlcommentranges = [];
			}
			if (!req.body.privatequiz || !(req.body.allowedparticipants instanceof Array)) {
				req.body.allowedparticipants = [];
			}
			//If the user has no db record in memory, load it now
			if (emailDBRecordMap.get(userEmail) == undefined) {
				let userDBID = await queryDB(`SELECT userID FROM user WHERE emailAddress = ?`, [userEmail]);
				if (userDBID.length < 1) {
					//The user does not exist, but this was retrieved server-side, so something is horribly wrong. Return error code and stop method execution.
					res.writeHead(500, {"Content-Type":"text/plain"});
					res.end("Something went wrong server-side! Very probably not your fault");
					return;
				} else if (userDBID.length > 1) {
					//Something is terribly, terribly wrong (multiple users with the same email address). Throw a fatal server-side error
					res.writeHead(500, {"Content-Type":"text/plain"});
					res.end("Multiple users have the same email address (inside DB)");
					throw new CatastrophicError("Multiple users have the same email address (inside DB)");
					//No need for return; the error stops execution of this function and propagates up the stack
				}
				emailDBRecordMap.set(userEmail, userDBID[0].userID);
			}
			//Ensure that input is ALWAYS 1 or 0
			let quiz = await queryDB(`INSERT INTO quiz (quizCode, userID, quizTitle, backgroundMusicSrc, doTimeLimit, doAnswerBuzzers, correctAnswerBuzzerSrc, incorrectAnswerBuzzerSrc, showGrade, showGradeComment, resultHTMLCommentRangesJSON, sendAnswers, answersRecipient, showCorrectAnswers, showPoints, ageRestriction, privateQuiz, allowedParticipantsListJSON, dateCreated)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				req.query.qc,
				emailDBRecordMap.get(userEmail),
				req.body.quiztitle,
				req.body.bgmusicsrc,
				req.body.dotimelimit,
				req.body.answerbuzzers,
				req.body.correctanswerbuzzersrc,
				req.body.incorrectanswerbuzzersrc,
				req.body.showgrade,
				req.body.showgradecomment,
				JSON.stringify(req.body.resulthtmlcommentranges),
				req.body.sendAnswers,
				req.body.answersrecipient,
				req.body.showcorrectanswers,
				req.body.showpoints,
				Number(req.body.agerestriction),
				req.body.privatequiz,
				JSON.stringify(req.body.allowedparticipants),
				toSQLDateTime(new Date())
			]);

			//Initialise socket prior to event firing to prevent deadlocks
			let questionNum = 0;
			let quizCode = req.query.qc;
			let questionsBeingSent = true;
			let userSocket = connectedSocketsMap.get(emailSocketIDMap.get(userEmail));
			if (userSocket == undefined) {
				console.log(cookies, emailSocketIDMap, connectedSocketsMap);
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong on the server-side! Please refresh the page and try again.");
				return;
			}
			let sentData;
			//Function to wait for incoming data and automatically reject within 5 seconds if no data is provided or the client disconnects
			/*let dataWaitPromiseFunc = function(res, rej) {
				let hasActivityOccurred = false;
				let dataFunc = function(data) {
					//Prevent the promise from being rejected in the future
					hasActivityOccurred = true;
					removeListeners();
					res(data);
				}
				//To be executed when the quiz transmission finishes
				let transferFinishFunc = function() {
					hasActivityOccurred = true;``
					questionsBeingSent = false;
					removeListeners();
					rej("Success: the transfer has been completed");
				}
				userSocket.on("endstream", transferFinishFunc);

				//To be invoked after socket "disconnect" event
				let socketDisconnectHandler = function() {
					removeListeners();
					rej("Error: the socket has disconnected during the stream");
				}
				userSocket.on("disconnect", socketDisconnectHandler);

				//Function to remove socket listeners whenever about to resolve or reject promise
				let removeListeners = function() {
					userSocket.removeListener("quizQuestionStream", dataFunc);
					userSocket.removeListener("disconnect", socketDisconnectHandler);
					userSocket.removeListener("endstream", transferFinishFunc);
				}

				//If no data has been received within 5 seconds of the server waiting for said data's receipt, reject this promise
				setTimeout(function() {
					if (!hasActivityOccurred) {
						removeListeners();
						rej("Error (Socket timeout): waiting period of 5000ms has been surpassed");
					}
				}, 5000);
				//Handle received quiz question data accordingly, by resolving the promise with it
				userSocket.on("quizQuestionStream", dataFunc);
			};
			//Create the promise from now, to prevent future deadlocks. If the previously created promise resolves before the "await" clause, awaiting it will immediately return the value with which the promise has resolved
			let p = new Promise(dataWaitPromiseFunc);

			res.writeHead(200, {"Content-Type":"text/plain"});
			res.end();

			//If the "endstream" event is emitted while not awaiting the resolution (or rejection) of a promise, this handler should update the necessary flags accordingly
			let streamEndExit = function() {
				userSocket.removeListener("endstream", streamEndExit);
				questionsBeingSent = false;
			}
			userSocket.on("endstream", streamEndExit);
			//Successfully wrote quiz metadata to server. Now, we must stream the questions one by one
			try {
				while (questionsBeingSent) {
					sentData = JSON.parse(await p);
					for (let i = 0; i < sentData.options.length; i++) {
						sentData.options[i] = sanitiseUserInputForHTML(sentData.options[i]);
					}
					for (let i = 0; i < sentData.answers.length; i++) {
						sentData.answers[i] = sanitiseUserInputForHTML(sentData.answers[i]);
					}
					//Store newly-received question in DB
					await queryDB(`INSERT INTO question (quizCode, questionNumber, questionHTMLSanitised, questionType, optionsJSON, correctOptionsJSON, caseSensitive, correctAnswerMessageHTMLSanitised, incorrectAnswerMessageHTMLSanitised, timeLimit, messageDuration, maxpoints)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
						quizCode,
						questionNum,
						sanitiseUserInputForHTML(sentData.question),
						sentData.questionType,
						JSON.stringify(sentData.options),
						JSON.stringify(sentData.answers),
						sentData.caseSensitive,
						sanitiseUserInputForHTML(sentData.correctanswermessage),
						sanitiseUserInputForHTML(sentData.incorrectanswermessage),
						sentData.timelimit,
						sentData.messageduration,
						sentData.maxpointsperquestion
					]);
					//Increment question number, which is used to identify the question in the DB
					questionNum++;
					//Create promise before sending data to prevent race conditions
					p = new Promise(dataWaitPromiseFunc);
					userSocket.emit("streamwritecompleted");
				}
			} catch (e) {
				if (questionsBeingSent) {
					//Something went wrong while streaming the questions
					console.log(e);
					userSocket.emit("streamwritefailed");
					return;
				}
			}
			try {
				//If the above if statement has not been executed, the error was thrown to exit the main loop following successful streaming completion. Nothing is wrong!
				await queryDB(`UPDATE quiz
					SET numQuestions = ?
					WHERE quizCode = ?`, [questionNum, req.query.qc]);
					//No need to increment questionNum, it would have already been incremented appropriately during the last iteration
			} catch (e) {
				console.log(e);
				userSocket.emit("streamwritefailed");
				return;
			}*/
			let dataWaitPromiseFunc = function(event, delay = 5000) {
				return function(res, rej) {
					let hasActivityOccurred = false;
					let dataFunc = function(data) {
						//Prevent the promise from being rejected in the future
						hasActivityOccurred = true;
						removeListeners();
						res(data);
					}
					//To be executed when the quiz transmission finishes
					let transferFinishFunc = function() {
						hasActivityOccurred = true;
						questionsBeingSent = false;
						removeListeners();
						res({code: "streamComplete", message: "Success: the transfer has been completed"});
					}
		
					//To be invoked after socket "disconnect" event
					let socketDisconnectHandler = function() {
						removeListeners();
						rej("Error: the socket has disconnected during the stream");
					}
		
					//Function to remove socket listeners whenever about to resolve or reject promise
					let removeListeners = function() {
						userSocket.removeListener(event, dataFunc);
						userSocket.removeListener("disconnect", socketDisconnectHandler);
						userSocket.removeListener("endstream", transferFinishFunc);
						clearTimeout(timeoutID);
					}
		
					//If no data has been received within 5 seconds of the server waiting for said data's receipt, reject this promise
					let timeoutID = setTimeout(function() {
						if (!hasActivityOccurred) {
							removeListeners();
							res({code: "socketTimeout", message: "Error (Socket timeout): waiting period of 5000ms has been surpassed"});
						}
					}, delay);
					//Handle received quiz question data accordingly, by resolving the promise with it
					userSocket.on("endstream", transferFinishFunc);
					userSocket.on("disconnect", socketDisconnectHandler);
					userSocket.on(event, dataFunc);
				};
			}
			let data;
			//Create the promise from now, to prevent future deadlocks. If the previously created promise resolves before the "await" clause, awaiting it will immediately return the value with which the promise has resolved
			let p = new Promise(dataWaitPromiseFunc("quizQuestionStream"));
	
			res.writeHead(200, {"Content-Type":"text/plain"});
			res.end();
	
			let abort = async function() {
				questionsBeingSent = false;
				socket.emit("streamwritefailed");
				//Something went wrong: delete the NEW quiz data
				await queryDB(`DELETE FROM quiz WHERE quizCode = ?`, [req.query.qc]);
			}
			//If the "endstream" event is emitted while not awaiting the resolution (or rejection) of a promise, this handler should update the necessary flags accordingly
			let streamEndExit = async function() {
				//userSocket.removeListener("endstream", streamEndExit);
				questionsBeingSent = false;
				//New quiz successfully transferred
				//If the above if statement has not been executed, the error was thrown to exit the main loop following successful streaming completion. Nothing is wrong!
				await queryDB(`UPDATE quiz
				SET numQuestions = ?
				WHERE quizCode = ?`, [questionNum, quizCode]);
				//No need to increment questionNum, it would have already been incremented at the end of the last iteration (that before the one which invoked this function)
			}
			//userSocket.on("endstream", streamEndExit);
			//Successfully wrote quiz metadata to server. Now, we must stream the questions one by one
			try {
				//Delete all of the old quiz questions from the DB here, since there would be little to stop the receipt of questions and one must assume that the old questions have been deleted
				while (questionsBeingSent) {
					//Create promise before sending data to prevent race conditions
					//The server will NOT ping the client, but the other way round. If the server receives a message, it will attempt to respond
					if (questionNum !== 0) {
						//The promise for the first question has already been set
						p = new Promise(dataWaitPromiseFunc("quizQuestionStream", 5000 * 10));
						//Refers to the previous question
						userSocket.emit("streamwritecompleted");
					}
					//On the first receipt attempt of the first question, the signal would have been sent by the http response
					data = await p;
					if (typeof data === "object") {
						if (data.code === "streamComplete") {
							//Stream complete! Break out of the loop
							await streamEndExit();
							break;
						} else if (data.code !== "socketTimeout") {
							//Question not duly received; abort and exit method
							await abort();
							return;
						}
					}
					//Question successfully received; continue
					//Promise would have been resolved by now; this would yield a value virtually instantly
					sentData = JSON.parse(data);
					for (let i = 0; i < sentData.options.length; i++) {
						sentData.options[i] = sanitiseUserInputForHTML(sentData.options[i]);
					}
					for (let i = 0; i < sentData.answers.length; i++) {
						sentData.answers[i] = sanitiseUserInputForHTML(sentData.answers[i]);
					}
					//Store newly-received question in DB
					await queryDB(`INSERT INTO question (quizCode, questionNumber, questionHTMLSanitised, questionType, optionsJSON, correctOptionsJSON, caseSensitive, correctAnswerMessageHTMLSanitised, incorrectAnswerMessageHTMLSanitised, timeLimit, messageDuration, maxpoints)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
						quizCode,
						questionNum,
						sanitiseUserInputForHTML(sentData.question),
						sentData.questionType,
						JSON.stringify(sentData.options),
						JSON.stringify(sentData.answers),
						sentData.caseSensitive,
						sanitiseUserInputForHTML(sentData.correctanswermessage),
						sanitiseUserInputForHTML(sentData.incorrectanswermessage),
						sentData.timelimit,
						sentData.messageduration,
						sentData.maxpointsperquestion
					]);
					//Increment question number, which is used to identify the question in the DB
					questionNum++;
				}
			} catch (e) {
				console.log(e);
				//Something went wrong while streaming the questions
				abort();
				return;
			}
			userSocket.emit("quizfilestreamclose");
		}
		/*fs.stat(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A"), async function(err, stat) {
			if (err == null) {
				res.writeHead(403, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:"This quiz code is taken. Please choose another one", state:"failure", data:null}));
			} else if (err.code == "ENOENT") {
				var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
				var err = await new Promise(function(res, rej) {
					readstream.on("open", res.bind(this, null));
					readstream.on("error", rej);
				});
				if (err != null) {
					if (err.code == "ENOENT") {
						res.writeHead(404, {"Content-Type":"application/json"});
						res.end(JSON.stringify({error:"User not found", state:"failure", data:null}));
					} else {
						res.writeHead(500, {"Content-Type":"application/json"});
						res.end(JSON.stringify({error:"Quiz creation unexpectedly failed", state:"failure", data:null}));
					}
					return undefined;
				}
				var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStatsTemp.txt", {flags:"a"});
				var lreader = linereader.createInterface({
					input: readstream,
					crlfDelay: Infinity
				});
				parr.push(new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {writestream.on("close", res)}), new Promise(function(res, rej) {lreader.on("close", res)}));
				let i = 0;
				for await (var line of lreader) {
					if (i === 0) {
						writestream.write(line);
					} else {
						writestream.write("\n" + line);
					}
					if (i === userAccountPropLines.OWNEDQUIZZES) {
						writestream.write("," + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A"));
					}
					i++;
				}
				readstream.destroy();
				writestream.destroy();
				lreader.close();
				await new Promise(function(res, rej) {
					fs.mkdir(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A"), function(err) {
						if (err) {
							rej(err);
						} else {
							res();
						}
					});
				});
				writestream = fs.createWriteStream(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + "/quizQuestions.txt", {flags:"a"});
				connectedSockets[req.session.socketid].allocatedStreams.push(writestream);
				parr.push(new Promise(function(res, rej) {writestream.on("close", res)}));
				//Set previously-declared block-scope (let) variable to 0 to count the number of questions written
				i = 0;
				//Emit events for completion and stream writing (instead of dumping the whole quiz at one go, possibly too large a payload)
				var socketStreamEventHandler = function(data) {
					//Check
					try {
						writestream.write(data);
						connectedSockets[req.session.socketid].emit("streamwritecompleted");
						i++;
					} catch (e) {
						connectedSockets[req.session.socketid].emit("streamwritefailed");
					}
				};
				var socketStreamFinishHandler = async function() {
					writestream.destroy();
					//Done with write stream - remove it from array of streams allocated for socket only
					connectedSockets[req.session.socketid].allocatedStreams.splice(connectedSockets[req.session.socketid].allocatedStreams.indexOf(writestream), 1);
					connectedSockets[req.session.socketid].removeListener("stream", socketStreamEventHandler);
					connectedSockets[req.session.socketid].removeListener("endstream", socketStreamFinishHandler);
					await Promise.all(parr);
					await new Promise(function(res, rej) {
						fs.unlink(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
					});
					await new Promise(function(res, rej) {
						fs.rename(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStatsTemp.txt", __dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt", res);
					});
					connectedSockets[req.session.socketid].emit("quizfilestreamclose");
					await new Promise(function(res, rej) {
						req.body.creatorEmail = req.session.email;
						req.body.numQuestions = i;
						fs.writeFile(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + "/quizMetadata.txt", JSON.stringify(req.body), res);
					});
				}
				connectedSockets[req.session.socketid].on("stream", socketStreamEventHandler);
				connectedSockets[req.session.socketid].on("endstream", socketStreamFinishHandler);
				//writestream.write(JSON.stringify(req.body));
				//Make sure all handles to the files are removed
				res.writeHead(200, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:null, state:"success", data:null}));
			} else {
				res.writeHead(500, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:"Quiz cannot be created at the moment. Please try again later", state:"failure", data:null}));
			}
		});*/
	} else {
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("You must be authenticated (logged in) to upload your own quiz");
	}
});

//1l0v3+r:v!a
app.put("/sendeditedquiz", async function(req, res) {
	//Check whether session id is outdated BEFORE reading the maps
	let cookies = getCookies(req);
	await updateSessionID(cookies.sessionid);
	let userEmail = sessionIDEmailMap.get(cookies.sessionid);
	//The user is loaded in memory
	if (userEmail != undefined) {
		//Check quiz code lengths
		if (typeof req.query.qc !== "string") {
			res.writeHead(400, {"Content-Type":"text/plain"});
			res.end("The \"qc\" parameter must be specified in the query string to determine the old quiz's code");
		} else if (typeof req.body.qc !== "string") {
			res.writeHead(400, {"Content-Type":"text/plain"});
			res.end("The \"qc\" field in the JSON payload must be specified to determine the new quiz's code");
		}
		if (req.query.qc.length > 20) {
			//Quiz code must be at most 20 characters long! This prevents error-throwing (and consequently server-crashing) attempts at entering duplicate quiz codes (Primary Key) within the DB due to trimmed quiz lengths bypassing server-side validation
			res.writeHead(400, {"Content-Type":"text/plain"});
			res.end("The old quiz's code must be at most 20 characters long");
			return;
			//Short-circuiting 'AND' statement to prevent the second expression from being evaluated in the case of the first one yielding false, which prevents the possibility of accessing properties of undefined
		} else if (req.body.qc.length > 20) {
			//Quiz code must be at most 20 characters long! This prevents error-throwing and consequently server-crashing attempts at entering duplicate quiz codes (Primary Key) within the DB due to trimmed quiz lengths bypassing server-side validation
			res.writeHead(400, {"Content-Type":"text/plain"});
			res.end("The quiz's new code must be at most 20 characters long");
			return;
		}
		//Check if the specified quiz code already exists.
		//NOTE: req.query.qc here specifies the code of the OLD quiz, not the new one.
		let equivalentQuizzes = await queryDB(`SELECT userID, dateCreated FROM quiz WHERE quizCode = ?`, [req.query.qc]);
		if (equivalentQuizzes.length === 0) {
			//Quiz does not exist
			res.writeHead(409, {"Content-Type":"text/plain"});
			res.end("The specified quiz code does not exist. Please choose another.");
			return;
		} else if (equivalentQuizzes.length > 1) {
			//Catastrophe: More than one quiz shares the same code - throw fatal server-side error
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Catastrophic server-side error: Multiple quizzes of the same code exist. Server crashing...");
			throw new CatastrophicError("Catastrophic server-side error: Multiple quizzes of the same code exist. Server crashing...");
		}

		//Check if the user owns the quiz
		if (equivalentQuizzes[0].userID !== emailDBRecordMap.get(userEmail)) {
			//This user is not the quiz's creator and hence is not allowed to modify it
			res.writeHead(403, {"Content-Type": "text/html"});
			res.end("You do not own this quiz and hence cannot edit it");
			return;
		}
		let quizCreationDate = equivalentQuizzes[0].dateCreated;

		let quizCodeUnchanged = false;
		//A temporary, unique alias for the new quiz as data is sent to the server
		let newTempQuizCode;
		if (req.body.qc === req.query.qc) {
			quizCodeUnchanged = true;
			do {
				newTempQuizCode = createUUID().slice(0, 20);
				equivalentQuizzes = (await queryDB(`SELECT COUNT(quizID) FROM quiz WHERE quizCode = ?`, [newTempQuizCode]))[0]["COUNT(quizID)"];
			} while (equivalentQuizzes > 0);
			req.body.qc = newTempQuizCode;
		}
		//Quiz already exists - good. Attempt to check whether or not the new quiz code exists and whether the old quiz is owned by this particular user
		equivalentQuizzes = await queryDB(`SELECT userID FROM quiz WHERE quizCode = ?`, [req.body.qc]);
		if (equivalentQuizzes.length === 1 && !quizCodeUnchanged) {
			//Quiz does not exist
			res.writeHead(409, {"Content-Type":"text/plain"});
			res.end("The new quiz code has been taken. Please choose another.");
			return;
		} else if (equivalentQuizzes.length > 1) {
			//Catastrophe: More than one quiz shares the same code - throw fatal server-side error
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Catastrophic server-side error: Multiple quizzes of the same code exist. Server crashing...");
			throw new CatastrophicError("Catastrophic server-side error: Multiple quizzes of the same code exist. Server crashing...");
		}
		//If the user has no db record in memory, load it now
		if (emailDBRecordMap.get(userEmail) == undefined) {
			let userDBID = await queryDB(`SELECT userID FROM user WHERE emailAddress = ?`, [userEmail]);
			if (userDBID.length < 1) {
				//The user does not exist, but this was retrieved server-side, so something is horribly wrong. Return error code and stop method execution.
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong server-side! Very probably not your fault");
				return;
			} else if (userDBID.length > 1) {
				//Something is terribly, terribly wrong (multiple users with the same email address). Throw a fatal server-side error
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Multiple users have the same email address (inside DB)");
				throw new CatastrophicError("Multiple users have the same email address (inside DB)");
				//No need for return; the error stops execution of this function and propagates up the call stack
			}
			emailDBRecordMap.set(userEmail, userDBID[0].userID);
		}

		//Cast a number of attributes from boolean to number with bounds checking (true -> 1, false -> 0)
		let attrsToNum = ["bgmusic", "dotimelimit", "answerbuzzers", "showgrade", "showgradecomment", "sendAnswers", "showcorrectanswers", "showpoints", "privatequiz"];
		for (let attribute of attrsToNum) {
			req.body[attribute] = Number(req.body[attribute]);
			if (req.body[attribute] !== 1 && req.body[attribute] !== 0) {
				req.body[attribute] = 0;
			}
		}
		//Check for null on flags determining the presence of a particular quiz feature (e.g.: music) and nullify the field which would typically store the resource URI
		if (!req.body.bgmusic) {
			req.body.bgmusicsrc = null;
		}

		//req.body.showgradecomment cannot be 1 (true) if req.body.showgrade is 0 (false)
		req.body.showgradecomment = req.body.showgrade & req.body.showgradecomment;

		//Enforce data consistency: data is logical and consistent (follows rules and standards). No need to involve req.body.showgrade as req.body.showgradecomment has already been set to false if showgrade were false.
		if (!req.body.showgradecomment || !(req.body.resulthtmlcommentranges instanceof Array)) {
			//Very simple optimisation to reduce space allocation: Destroy grade comment data in the case of it not being needed
			req.body.resulthtmlcommentranges = [];
		}
		if (!req.body.privatequiz || !(req.body.allowedparticipants instanceof Array)) {
			req.body.allowedparticipants = [];
		}
		//The DB record has already been loaded in memory through this operation being done earlier in the method
		/*if (emailDBRecordMap.get(userEmail) == undefined) {
			let userDBID = await queryDB(`SELECT userID FROM user WHERE emailAddress = ?`, [userEmail]);
			if (userDBID.length < 1) {
				//The user does not exist, but this was retrieved server-side, so something is horribly wrong. Return error code and stop method execution.
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong server-side! Very probably not your fault");
				return;
			} else if (userDBID.length > 1) {
				//Something is terribly, terribly wrong (multiple users with the same email address). Throw a fatal server-side error
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Multiple users have the same email address (inside DB)");
				throw new CatastrophicError("Multiple users have the same email address (inside DB)");
				//No need for return; the error stops execution of this function and propagates up the stack
			}
			emailDBRecordMap.set(userEmail, userDBID[0].userID);
		}*/
		//Ensure that input is ALWAYS 1 or 0
		//DO NOT update the existing quiz; create a quiz whose code is that of the new one, insert its questions and delete the old quiz AFTER the new one has been inserted
		/*Old update SQL statement: `UPDATE quiz 
		SET quizCode = ?, userID = ?, quizTitle = ?, backgroundMusicSrc = ?, doTimeLimit = ?, doAnswerBuzzers = ?, correctAnswerBuzzerSrc = ?, incorrectAnswerBuzzerSrc = ?, showGrade = ?, showGradeComment = ?, resultHTMLCommentRangesJSON = ?, sendAnswers = ?, answersRecipient = ?, showCorrectAnswers = ?, showPoints = ?, ageRestriction = ?, privateQuiz = ?, allowedParticipantsListJSON = ?
		WHERE quizCode = ?`*/
		let quiz = await queryDB(`INSERT INTO quiz (quizCode, userID, quizTitle, backgroundMusicSrc, doTimeLimit, doAnswerBuzzers, correctAnswerBuzzerSrc, incorrectAnswerBuzzerSrc, showGrade, showGradeComment, resultHTMLCommentRangesJSON, sendAnswers, answersRecipient, showCorrectAnswers, showPoints, ageRestriction, privateQuiz, allowedParticipantsListJSON, dateCreated)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			req.body.qc,
			emailDBRecordMap.get(userEmail),
			req.body.quiztitle,
			req.body.bgmusicsrc,
			req.body.dotimelimit,
			req.body.answerbuzzers,
			req.body.correctanswerbuzzersrc,
			req.body.incorrectanswerbuzzersrc,
			req.body.showgrade,
			req.body.showgradecomment,
			JSON.stringify(req.body.resulthtmlcommentranges),
			req.body.sendAnswers,
			req.body.answersrecipient,
			req.body.showcorrectanswers,
			req.body.showpoints,
			Number(req.body.agerestriction),
			req.body.privatequiz,
			JSON.stringify(req.body.allowedparticipants),
			quizCreationDate/*,
			toSQLDateTime(new Date())*/
			/*THIS ENTRY MUST ALWAYS BE THE FINAL ONE, FOR IT IS FOR THE 'WHERE' CLAUSE*/
			/*,req.query.qc*/
		]);

		//Initialise socket prior to event firing to prevent deadlocks
		let questionNum = 0;
		//Use the new quiz code
		let quizCode = req.body.qc;
		let questionsBeingSent = true;
		let userSocket = connectedSocketsMap.get(emailSocketIDMap.get(userEmail));
		if (userSocket == undefined) {
			console.log(cookies, emailSocketIDMap, connectedSocketsMap);
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Something went wrong on the server-side! Please refresh the page and try again.");
			return;
		}
		let sentData;
		//Function to wait for incoming data and automatically reject within 5 seconds if no data is provided or the client disconnects
		let dataWaitPromiseFunc = function(event, delay = 5000) {
			return function(res, rej) {
				let hasActivityOccurred = false;
				let dataFunc = function(data) {
					//Prevent the promise from being rejected in the future
					hasActivityOccurred = true;
					removeListeners();
					res(data);
				}
				//To be executed when the quiz transmission finishes
				let transferFinishFunc = function() {
					hasActivityOccurred = true;
					questionsBeingSent = false;
					removeListeners();
					res({code: "streamComplete", message: "Success: the transfer has been completed"});
				}
	
				//To be invoked after socket "disconnect" event
				let socketDisconnectHandler = function() {
					removeListeners();
					rej("Error: the socket has disconnected during the stream");
				}
	
				//Function to remove socket listeners whenever about to resolve or reject promise
				let removeListeners = function() {
					userSocket.removeListener(event, dataFunc);
					userSocket.removeListener("disconnect", socketDisconnectHandler);
					userSocket.removeListener("endstream", transferFinishFunc);
					clearTimeout(timeoutID);
				}
	
				//If no data has been received within 5 seconds of the server waiting for said data's receipt, reject this promise
				let timeoutID = setTimeout(function() {
					if (!hasActivityOccurred) {
						removeListeners();
						res({code: "socketTimeout", message: "Error (Socket timeout): waiting period of 5000ms has been surpassed"});
					}
				}, delay);
				//Handle received quiz question data accordingly, by resolving the promise with it
				userSocket.on("endstream", transferFinishFunc);
				userSocket.on("disconnect", socketDisconnectHandler);
				userSocket.on(event, dataFunc);
			};
		}
		let data;
		//Create the promise from now, to prevent future deadlocks. If the previously created promise resolves before the "await" clause, awaiting it will immediately return the value with which the promise has resolved
		let p = new Promise(dataWaitPromiseFunc("quizQuestionStream", 5000 * 10));

		let abort = async function() {
			questionsBeingSent = false;
			userSocket.emit("streamwritefailed");
			//Something went wrong: delete the NEW quiz data
			await queryDB(`DELETE FROM quiz WHERE quizCode = ?`, [req.body.qc]);
		}
		//If the "endstream" event is emitted while not awaiting the resolution (or rejection) of a promise, this handler should update the necessary flags accordingly
		let streamEndExit = async function() {
			//userSocket.removeListener("endstream", streamEndExit);
			questionsBeingSent = false;
			//New quiz successfully transferred: delete the OLD quiz data
			await queryDB(`DELETE FROM quiz WHERE quizCode = ?`, [req.query.qc]);
			//If the above if statement has not been executed, the error was thrown to exit the main loop following successful streaming completion. Nothing is wrong!
			await queryDB(`UPDATE quiz
			SET numQuestions = ?
			WHERE quizCode = ?`, [questionNum, quizCode]);
			//No need to increment questionNum, it would have already been incremented at the end of the last iteration (that before the one which invoked this function)
			if (quizCodeUnchanged) {
				//Change the alias
				await queryDB(`UPDATE quiz
				SET quizCode = ?
				WHERE quizCode = ?`, [
					req.query.qc,
					req.body.qc
				]);
			}
		}

		res.writeHead(200, {"Content-Type":"text/plain"});
		res.end();

		//userSocket.on("endstream", streamEndExit);
		//Successfully wrote quiz metadata to server. Now, the questions must be streamed to the server one by one
		try {
			//Delete all of the old quiz questions from the DB here, since there would be little to stop the receipt of questions and one must assume that the old questions have been deleted
			while (questionsBeingSent) {
				//Create promise before sending data to prevent race conditions
				//The server will NOT ping the client, but the other way round. If the server receives a message, it will attempt to respond. If said message is not received by the client within a given timespan, the client will attempt to resend the data to the server
				if (questionNum !== 0) {
					//The promise for the first question has already been set
					p = new Promise(dataWaitPromiseFunc("quizQuestionStream", 5000 * 10));
					//Refers to the previous question
					userSocket.emit("streamwritecompleted");
				}
				data = await p;
				//On the first receipt attempt of the first question, the signal would have been sent by the http response
				if (typeof data === "object") {
					if (data.code === "streamComplete") {
						//Stream complete! Break out of the loop
						await streamEndExit();
						break;
					} else if (data.code === "socketTimeout") {
						//Question not duly received; abort and exit method
						await abort();
						return;
					}
				}
				//Question successfully received; continue
				//Promise would have been resolved by now; this would yield a value virtually instantly
				sentData = JSON.parse(data);
				for (let i = 0; i < sentData.options.length; i++) {
					sentData.options[i] = sanitiseUserInputForHTML(sentData.options[i]);
				}
				for (let i = 0; i < sentData.answers.length; i++) {
					sentData.answers[i] = sanitiseUserInputForHTML(sentData.answers[i]);
				}
				//Store newly-received question in DB
				await queryDB(`INSERT INTO question (quizCode, questionNumber, questionHTMLSanitised, questionType, optionsJSON, correctOptionsJSON, caseSensitive, correctAnswerMessageHTMLSanitised, incorrectAnswerMessageHTMLSanitised, timeLimit, messageDuration, maxpoints)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
					quizCode,
					questionNum,
					sanitiseUserInputForHTML(sentData.question),
					sentData.questionType,
					JSON.stringify(sentData.options),
					JSON.stringify(sentData.answers),
					sentData.caseSensitive,
					sanitiseUserInputForHTML(sentData.correctanswermessage),
					sanitiseUserInputForHTML(sentData.incorrectanswermessage),
					sentData.timelimit,
					sentData.messageduration,
					sentData.maxpointsperquestion
				]);
				//Increment question number, which is used to identify the question in the DB
				questionNum++;
			}
		} catch (e) {
			console.log(e);
			//Something went wrong while streaming the questions
			abort();
			return;
		}
		//By now, the old quiz has been deleted by the streamEndExit() function
		//await queryDB(`DELETE FROM quiz WHERE quizCode = ?`, [req.query.qc]);
		userSocket.emit("quizfilestreamclose");
	} else {
		res.writeHead(403, {"Content-Type":"text/plain"});
		res.end("You must be authenticated (logged in) to your account to modify your own quizzes");
	}
});

/*app.post("/getallcreatedquizzes", async function(req, res) {
	if (req.session.code === req.cookies.sessionid && req.session.email != undefined) {
		var parr = [], quizzesdata = [], quizdatakeys = req.body.createdquizdatakeys;
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
		var lreader = linereader.createInterface({
			input: readstream,
 			crlfDelay: Infinity
		});
		parr.push(new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {lreader.on("close", res)}));
		var clientquizzes = await new Promise(function(res, rej) {
			let i = 0;
			lreader.on("line", function(data) {
				if (i === userAccountPropLines.OWNEDQUIZZES) {
					lreader.close();
					readstream.destroy();
					res(data.split(","));
					return;
				}
				i++;
			});
		});
		let json, badQuizOffset = 0;
		for (let i = 0; i < clientquizzes.length; i++) {
			//MUST use try... catch instead of promise .catch() method in order to
			try {
				json = JSON.parse(await new Promise(function(res, rej) {
					fs.readFile(__dirname + "/server_data/existingquizzes/" + clientquizzes[i] + "/quizMetadata.txt", function(err, dat) {
						if (err) {
							rej(err);
						} else {
							res(dat);
						}
					});
				}));
			} catch (err) {
				//Funny that...
				if (err.code === "ENOENT") {
					//Quiz owned by creator does not exist (BUG) - continue on to next owned quiz (if applicable)
					badQuizOffset++;
					continue;
				} else {
					res.writeHead(500, {"Content-Type":"application/json"});
					res.end(JSON.stringify({error:"Loading of quizzes has failed", state:"failure", data:null}));
					return undefined;
				}
			}
			//Set data here to omit any redundant fields (those whose quiz throw ENOENT errors)
			quizzesdata[i - badQuizOffset] = {};
			quizzesdata[i - badQuizOffset].quizcode = decodeURIComponent(clientquizzes[i]); //badQuizOffset deliberately excluded
			for (let j = 0; j < quizdatakeys.length; j++) {
				//Get metadata (can be loaded in memory in its entirety at once - metadata is typically quite small: <2KB)
				//Legacy code
				//jparser = JSONStream.parse(quizdata[j]);
				//var data = new Promise(function(res, rej) {jparser.on("data", res); setTimeout(res, 1000, null)});
				//stream.pipe(jparser);
				//quizzesdata[i][quizdata[j]] = await data;
				//parr.push(new Promise(function(res, rej) {stream.on("close", res)}));
				//stream.destroy();
				quizzesdata[i - badQuizOffset][quizdatakeys[j]] = json[quizdatakeys[j]];
			}
		}
		await Promise.all(parr);
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:null, state:"success", data:quizzesdata}));
	} else {
		res.writeHead(403, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:"You are not authenticated", state:"failure", data:null}));
	}
});*/

app.post("/modifyexistingquiz", async function(req, res) {
	if (req.session.code === req.cookies.sessionid && req.session.email != undefined) {
		var parr = [];
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
		var lreader = linereader.createInterface({
			input: readstream,
 			crlfDelay: Infinity
		});
		parr.push(new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {lreader.on("close", res)}));
		var clientquizzes = JSON.parse(await new Promise(function(res, rej) {
			lreader.on("line", function(data) {lreader.close(); readstream.destroy(); res(data)});
		})).createdquizcodes;
		var quizexists = await new Promise(function(res, rej) {
			//THIS IS A NIGHTMARE!!! FIX IT ALL!!!
			fs.stat(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + ".txt", function(err, stat) {if (err) {res(false)} else {res(true)}});
		});
		if (clientquizzes.indexOf(encodeURIComponent(req.query.qc)) === -1) {
			if (quizexists) {
				res.writeHead(403, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:"You are not the owner of this quiz and hence cannot modify it", state:"failure", data:null}));
			} else {
				res.writeHead(403, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:"This quiz does not exist. Please check the quiz code and try again", state:"failure", data:null}));
			}
			return undefined;
		}
		await new Promise(function(res, rej) {
			//THIS TOO!!!
			fs.writeFile(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + ".txt", "", res);
		});
		//AND THIS!!!
		var writestream = fs.createWriteStream(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + ".txt", {flags:"a"});
		parr.push(new Promise(function(res, rej) {writestream.on("close", res)}))
		req.body.creatorEmail = req.session.email;
		writestream.write(JSON.stringify(req.body));
		writestream.destroy();
		await Promise.all(parr);
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:null, state:"success", data:null}));
	} else {
		res.writeHead(403, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:"You are not authenticated", state:"failure", data:null}));
	}
});

//TODO: Remove, no longer needed!
/*function countFileLines(filePath){
	return new Promise(function(res, rej) {
		let lineCount = 0;
		var strm = fs.createReadStream(filePath);
		strm.on("data", function(buffer) {
			let idx = -1;
			//lineCount--; // Because the loop will run once for idx=-1, however the first line must be considered
			do {
				idx = buffer.indexOf(10, idx+1);
				lineCount++;
			} while (idx !== -1);
		}).on("end", () => {
			strm.destroy();
			res(lineCount);
		}).on("error", rej);
	});
};*/

app.get("/getnotifications", async function(req, res) {
	var parr = [];
	//Check whether session id is outdated BEFORE reading the maps
	await updateSessionID(getCookies(req).sessionid);
	let userEmail = sessionIDEmailMap.get(getCookies(req).sessionid);
	if (userEmail == undefined) {
		res.writeHead(401, {"Content-Type":"text/plain"})
		res.end("Only signed in users can receive notifications (User not authenticated)");
	} else {
		let firstNotificationIndex = Math.floor(Number(req.query.firstnotificationindex));
		let numDesiredNotifications = Math.floor(Number(req.query.numnotifications));
		var numNotifications = (await queryDB(`SELECT COUNT(notificationNumber) FROM notification WHERE
			userID = ?`, [emailDBRecordMap.get(userEmail)]))[0]["COUNT(notificationNumber)"];
		//Validation: prevent server-side crashes due to invalid input
		if (Number.isNaN(firstNotificationIndex)) {
			firstNotificationIndex = 0;
		}
		if (Number.isNaN(numDesiredNotifications)) {
			numDesiredNotifications = 0;
		}

		//INCORRECT CODE
		/*if (firstNotificationIndex < 0) {
			//Start getting notifications from the end, with length going backwards
			//Alter firstnotificationIndex to make it return from the very end to make it seem as if numDesirednotifications would begin to count backwards
			//Do not subtract, but add, because in this case firstNotificationIndex is negative; subtracting by a negative number will increase the first operand (yield an increased result)
			firstNotificationIndex = Math.max(numNotifications + firstNotificationIndex - numDesiredNotifications, 0);
			var endreached = (firstNotificationIndex === 0);
		} else {
			var endreached = firstNotificationIndex + numDesiredNotifications >= numNotifications;
		}*/

		var endreached = firstNotificationIndex + numDesiredNotifications >= numNotifications;
		//Get the requested notifications and all related data
		let data;
		//Start from the latest notification for positive values
		if (firstNotificationIndex < 0) {
			firstNotificationIndex = -firstNotificationIndex;
			//Sort from the beginning (ascending order)
			data = await queryDB(`SELECT * FROM notification WHERE userID = ? ORDER BY notificationNumber ASC LIMIT ? OFFSET ?`, [emailDBRecordMap.get(userEmail), numDesiredNotifications, firstNotificationIndex]);
		} else {
			//Sort from the end (descending order)
			data = await queryDB(`SELECT * FROM notification WHERE userID = ? ORDER BY notificationNumber DESC LIMIT ? OFFSET ?`, [emailDBRecordMap.get(userEmail), numDesiredNotifications, firstNotificationIndex]);
		}
		for (var entry of data) {
			delete entry.userID;
			entry.recipientEmail = userEmail;
		}
		/*var numberoflines = await countFileLines(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt");
		var numberofreadlines = 0, data = [];
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt");
		var lr = linereader.createInterface({
			input: readstream,
			crlfDelay: Infinity
		});
		var minlines = parseFloat(req.query.minlinesfromend), maxlines = parseFloat(req.query.maxlinesfromend);
		parr.push(new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {lr.on("close", res)}));
		for await (var chunk of lr) {
			numberofreadlines++;
			chunkobj = JSON.parse(chunk);
			if (numberofreadlines <= numberoflines - minlines + 1 && numberofreadlines >= numberoflines - maxlines) {
				data.push({seen:chunkobj.seen, sender:chunkobj.sender, recipients:chunkobj.recipients, dateIssued:chunkobj.dateIssued, data:chunkobj.data});
			}
			if (numberofreadlines > numberoflines - minlines || numberoflines === req.query.maxlinesfromend) {
				break;
			}
		}
		readstream.destroy();
		lr.close();
		await Promise.all(parr);*/
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({endreached, data:data}));
	}
});

app.get("/getOwnQuizzes", async function(req, res) {
	//Check whether session id is outdated BEFORE reading the maps
	await updateSessionID(getCookies(req).sessionid);
	let userEmail = sessionIDEmailMap.get(getCookies(req).sessionid);
	let userDBID = emailDBRecordMap.get(userEmail);
	if (userEmail == undefined) {
		//User not signed in
		res.writeHead(401, {"Content-Type":"text/plain"});
		res.end("Only signed in users can get their own quizzes (User not authenticated)");
		return;
	}
	//Get the quizzes as specified by the user
	if (userDBID == undefined) {
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("Something went wrong while ftching your quizzes. Please refresh the page and try again.");
		return;
	}

	//Check if the values are NaN and validate accordingly
	req.query.firstQuizIndex = Number(req.query.firstQuizIndex);
	req.query.numQuizzes = Number(req.query.numQuizzes);
	if (Number.isNaN(req.query.firstQuizIndex)) {
		req.query.firstQuizIndex = 0;
	}

	if (Number.isNaN(req.query.numQuizzes)) {
		req.query.numQuizzes = 0;
	}

	let quizzes;
	if (req.query.firstQuizIndex > 0) {
		//Start from the latest quiz
		quizzes = await queryDB(`SELECT quizCode, quizTitle, numQuestions, dateCreated FROM quiz WHERE userID = ? ORDER BY quizID DESC LIMIT ? OFFSET ?`, [userDBID, req.query.numQuizzes, req.query.firstQuizIndex]);
	} else {
		//Start from first quiz
		quizzes = await queryDB(`SELECT quizCode, quizTitle, numQuestions, dateCreated FROM quiz WHERE userID = ? ORDER BY quizID ASC LIMIT ? OFFSET ?`, [userDBID, req.query.numQuizzes, req.query.firstQuizIndex]);
	}
	res.writeHead(200, {"Content-Type": "application/json"});
	res.end(JSON.stringify({ready: quizzes.length < req.query.numQuizzes, data:quizzes}));
	return;
});

/*app.post("/setnotificationsproperty", async function(req, res) {
	var parr = [];
	if (req.session.email == undefined) {
		res.writeHead(404, {"Content-Type":"application/json"})
		res.end(JSON.stringify({error:"Only signed in users can receive notifications (User not authenticated)", state:"failure", data:null}))
	} else {
		var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotificationsTemp.txt", {flags:"a"});
		parr.push(new Promise(function(res, rej) {writestream.on("close", res)}));
		var numberoflines = await countFileLines(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt");
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt");
		parr.push(new Promise(function(res, rej) {readstream.on("close", res)}));
		var newnotificationsdata = req.body.newnotificationsdata;
		var numberofreadlines = 0, data, firstline = true;
		await new Promise(function(res, rej) {
			fs.writeFile(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotificationsTemp.txt", "", res);
		});
		var lr = linereader.createInterface({
			input: readstream,
			crlfDelay: Infinity
		});
		parr.push(new Promise(function(res, rej) {lr.on("close", res)}));
		var minlines = parseFloat(req.body.minlinesfromend), maxlines = parseFloat(req.body.maxlinesfromend);
		for await (var chunk of lr) {
			numberofreadlines++;
			if (!firstline) {
				if (numberofreadlines <= numberoflines - minlines && numberofreadlines >= numberoflines - maxlines) {
					chunk = "\n" + chunk;
				} else {
					var obj = JSON.parse(chunk);
					var newnotificationsdata = req.body.newnotificationsdata;
					var notificationnewkeys = Object.keys(newnotificationsdata);
					for (let i = 0; i < notificationnewkeys.length; i++) {
						obj[notificationnewkeys[i]] = newnotificationsdata[notificationnewkeys[i]];
					}
					chunk = "\n" + JSON.stringify(obj);
				}
			}
			firstline = false;
			writestream.write(chunk);
		}
		writestream.destroy();
		readstream.destroy();
		lr.close();
		await Promise.all(parr);
		await new Promise(function(res, rej) {
			fs.unlink(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt", res);
		});
		await new Promise(function(res, rej) {
			fs.rename(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotificationsTemp.txt", __dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt", res);
		});
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:null, state:"success", data:null}));
	}
});

app.post("/setallnotificationsproperty", async function(req, res) {
	var parr = [];
	if (req.session.code === req.cookies.sessionid && req.session.email != undefined) {
		var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotificationsTemp.txt", {flags:"a"});
		var readstream = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt");
		var newnotificationsdata = req.body.newnotificationsdata;
		var numberofreadlines = 0, data, firstline = true;
		var lr = linereader.createInterface({
			input: readstream,
			crlfDelay: Infinity
		});
		parr.push(new Promise(function(res, rej) {writestream.on("close", res)}), new Promise(function(res, rej) {readstream.on("close", res)}), new Promise(function(res, rej) {lr.on("close", res)}));
		for await (var chunk of lr) {
			numberofreadlines++;
			if (!firstline) {
				var obj = JSON.parse(chunk);
				var newnotificationsdata = req.body.newnotificationsdata;
				if (newnotificationsdata.propsValuesEqual(obj)) {
					chunk = "\n" + chunk;
				} else {
					var notificationnewkeys = Object.keys(newnotificationsdata);
					for (let i = 0; i < notificationnewkeys.length; i++) {
						obj[notificationnewkeys[i]] = newnotificationsdata[notificationnewkeys[i]];
					}
					chunk = "\n" + JSON.stringify(obj);
				}
			}
			firstline = false;
			writestream.write(chunk);
		}
		writestream.destroy();
		readstream.destroy();
		lr.close();
		await Promise.all(parr);
		await new Promise(function(res, rej) {
			fs.unlink(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt", res);
		});
		await new Promise(function(res, rej) {
			fs.rename(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotificationsTemp.txt", __dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userNotifications.txt", res);
		}).catch(function(err) {
		});
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:null, state:"success", data:null}));
	} else {
		res.writeHead(404, {"Content-Type":"application/json"})
		res.end(JSON.stringify({error:"User notifications do not exist (User not authenticated)", state:"failure", data:null}))
	}
});*/

app.post("/markAllNotificationsAsRead", async function(req, res) {
	//Check whether session id is outdated BEFORE reading the maps
	await updateSessionID(getCookies(req).sessionid);
	let userEmail = sessionIDEmailMap.get(getCookies(req).sessionid);
	if (userEmail == undefined) {
		res.writeHead(401, {"Content-Type":"text/plain"});
		res.end("You are not signed in and therefore cannot access or modify any notifications");
		return;
	}
	let userDBID = emailDBRecordMap.get(userEmail);
	await queryDB(`UPDATE notification
		SET hasBeenSeen = 1
		WHERE userID = ? AND hasBeenSeen = 0`, [userDBID]);
	res.writeHead(200, {"Content-Type":"text/plain"});
	res.end();
});

const NotificationStates = {
	OK: 0,
	EMAIL_NOT_FOUND: 1,
	CATASTROPHIC_ERROR: 3,
	UNKNOWN_ERROR: 4,
	CATASTROPHIC_ERROR_DUPLICATE_USER: 5
}
Object.freeze(NotificationStates);

/**Sends a notification.
 * On success, returns 0, if the recipient does not exist, returns 1
 */
async function sendNotification(userEmail, recipient, title, data) {
	try {
		let recipientIDs = await queryDB(`SELECT userID FROM user WHERE emailAddress = ?`, [recipient]);
		let recipientID;
		if (recipientIDs.length < 1) {
			//The specified email address does not exist or could not be found
			return NotificationStates.EMAIL_NOT_FOUND;
		} else if (recipientIDs.length > 1) {
			//Catastrophe - Multiple users share the same email address; throw fatal error
			return NotificationStates.CATASTROPHIC_ERROR_DUPLICATE_USER;
		} else {
			//The specified email address exists once, therefore only one object is present, at the zeroth index. No errors would be thrown for addressing members of undefined
			recipientID = recipientIDs[0].userID;
		}
		
		//Get the number of notifications associated with the user
		let numNotifications = (await queryDB(`SELECT COUNT(notificationNumber) FROM notification WHERE userID = ?`, [recipientID]))[0]["COUNT(notificationNumber)"];
		//Specify the notification's creation date, relative to the server
		let notificationCreationDate = Date.now();
		await queryDB(`INSERT INTO notification (notificationNumber, senderEmail, userID, creationDate, notificationTitle, notificationBody, hasBeenSeen)
			VALUES (?, ?, ?, ?, ?, ?, 0)`,
			[
				numNotifications,
				userEmail,
				recipientID,
				new Date(notificationCreationDate), /*TODO: Check. This may not be the most optimised way to go about it, but probably quite safe*/
				sanitiseUserInputForHTML(title),
				sanitiseUserInputForHTML(data)
			]);
		if (emailSocketIDMap.get(recipient) != undefined) {
			//User is online; attempt to send the notification
			io.to(emailSocketIDMap.get(recipient)).emit("notification", JSON.stringify({senderEmail:userEmail, recipientEmail:recipient, notificationBody:data, notificationTitle: title, creationDate:notificationCreationDate}));
		}
		//Success
		return NotificationStates.OK;
	} catch (e) {
		if (e instanceof CatastrophicError) {
			throw e;
		} else /*if (e.name != "TypeError")*/ {
			console.log(e);
			//Unidentifed error
			return NotificationStates.UNKNOWN_ERROR;
		}
	}
}

app.post("/sendnotification", async function(req, res) {
	//Check whether session id is outdated BEFORE reading the maps
	await updateSessionID(getCookies(req).sessionid);
	let userEmail = sessionIDEmailMap.get(getCookies(req).sessionid);
	if (userEmail == undefined) {
		res.writeHead(403, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:"You are not signed in to an account and therefore cannot send notifications", state:"failure", data:null}))
	} else {
		//req.body.data = encodeURIComponent(req.body.data);
		if (typeof req.body.data !== "string") {
			req.body.data = String(req.body.data);
		}
		switch (sendNotification(userEmail, req.body.recipient, req.body.title, req.body.data)) {
			case NotificationStates.OK:
				res.writeHead(200, {"Content-Type":"text/plain"});
				res.end();
				//OK: Notification has been sent successfully
				return;
			case NotificationStates.EMAIL_NOT_FOUND:
				//ERROR: The specified email address does not exist or could not be found
				res.writeHead(404, {"Content-Type":"text/plain"});
				res.end("The provided email address does not exist or could not be found");
				return;
			case NotificationStates.CATASTROPHIC_ERROR_DUPLICATE_USER:
				//ERROR: Multiple users share the same email address; throw fatal error
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Catastrophic server-side error: the specified email address is possessed by more than one user. Server crashing...");
				throw new CatastrophicError("The specified email address is possessed by more than one user. Server crashing...");
			case NotificationStates.UNKNOWN_ERROR:
				//Error: For some reason, the message could not have been sent
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("The message could not be sent");
				return;
		}
		//Attempt to store it in the DB first for persistence; it will appear when the user next loads a page which checks notifications

		//Get the number of notifications associated with the user
		/*let numNotifications = (await queryDB(`SELECT COUNT(notificationNumber) FROM notification WHERE userID = ?`, [recipientID]))[0]["COUNT(notificationNumber)"];
		//Specify the notification's creation date, relative to the server
		let notificationCreationDate = Date.now();
		await queryDB(`INSERT INTO notification (notificationNumber, senderEmail, userID, creationDate, notificationTitle, notificationBody, hasBeenSeen)
			VALUES (?, ?, ?, ?, ?, ?, 0)`,
			[
				numNotifications,
				userEmail,
				recipientID,
				new Date(notificationCreationDate),
				sanitiseUserInputForHTML(req.body.title),
				sanitiseUserInputForHTML(req.body.data)
			]);
		if (emailSocketIDMap.get(req.body.recipient) != undefined) {
			//User is online; attempt to send the notification
			io.to(emailSocketIDMap.get(req.body.recipient)).emit("notification", JSON.stringify({senderEmail:userEmail, recipientEmail:req.body.recipient, notificationBody:req.body.data, notificationTitle: req.body.title, creationDate:notificationCreationDate}));
		}*/
	}
});

//Extremely insecure and unreliable
/*app.post("/sendquizresults", async function(req, res) {
	let parr = [], quizNotificationString;
	//Check...
	req.body.to = sanitise(req.body.to);
	req.body.quizTitle = sanitise(req.body.quizTitle);
	req.body.username = sanitise(req.body.username);
	req.body.points = sanitise(req.body.points);
	req.body.accuracy = sanitise(req.body.accuracy);
	req.body.quizresults = sanitise(req.body.quizresults, {
		allowedAttributes: {
			"table":["border"]
		}
	});
	quizNotificationString = JSON.stringify({sender:"&lt;The Quiz App&gt;", recipients:[req.body.to], data:"Quiz results of quiz titled '" + req.body.quizTitle + "' taken by user '" + req.body.username + "' (email address: '" + (function() {if (req.session.email == undefined) {return"&lt;Anonymous&gt;"} else {return req.session.email}})() + "') being sent to you.<br />Points: " + req.body.points + "pts<br />Accuracy: " + req.body.accuracy + "<br />" + req.body.quizresults, dateIssued:Date.now()})
	try {
		io.to(emailSocketIds[req.body.to].socketid).emit("notification", quizNotificationString);
	} catch (e) {
		//TypeError thrown if undefined is treated as an object, meaning user is not online. No matter. Just shove it in his/her never-ending list of unread notifications...
		if (e.name != "TypeError") {
			res.writeHead(500, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"The message could not be sent", state:"success", data:null}));
			return;
		}
	}
	var recipient = req.body.to;
	var fileSize;
	//FIX ERROR THROWN - TRYING TO GET MEMBER 'SIZE' OF undefined
	var fileExists = await new Promise(function(res, rej) {fs.stat(__dirname + "/server_data/signedupclients/" + encodeURIComponent(recipient).replace(/[*]/g, "%2A") + "/userNotifications.txt", function(err, stats) {if (err) {res(false)} else {fileSize = stats.size; res(true)}})});
	if (fileExists) {
		var writestream = fs.createWriteStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(recipient).replace(/[*]/g, "%2A") + "/userNotifications.txt", {flags:"a"});
		try {
			await new Promise(function(res, rej) {
				writestream.on("ready", res);
				writestream.on("error", rej);
			});
		} catch (e) {
			res.writeHead(500, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"The message could not be sent", state:"success", data:null}));
			return;
		}
		parr.push(new Promise(function(res, rej) {writestream.on("close", res)}));
		//Order is crucial - potential line break BEFORE notification data
		if (fileSize > 0) {
			writestream.write("\n");
		}
		writestream.write(quizNotificationString);
		writestream.destroy();
		await Promise.all(parr);
		res.writeHead(200, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:null, state:"success", data:null}));
	} else {
		res.writeHead(404, {"Content-Type":"application/json"});
		res.end(JSON.stringify({error:"Specified recipient not found", state:"failure", data:null}));
	}
});*/

//This function merely tells the client whether or not it is logged in and if so, the email address to which it is logged in (checkAuth standing for 'check authentication')
app.get("/checkAuth", async function(req, res) {
	//Check whether session id is outdated BEFORE reading the maps
	await updateSessionID(getCookies(req).sessionid);
	res.writeHead(200, {"Content-Type":"application/json"});
	let emailAddress = sessionIDEmailMap.get(getCookies(req).sessionid);
	if (emailAddress == undefined) {
		res.end(JSON.stringify({authenticated:false, email:null}));
	} else {
		res.end(JSON.stringify({authenticated:true, email:emailAddress}));
	}
});

//This method has been deprecated, for it is extremely insecure and unreliable: client is trusted not to cheat
/*app.get("/getquizdata", async function(req, res) {
	var parr = [];
	var readStream;
	//What on earth????? Who wrote this garbage?!?!?! Oh, right...
	try {
		await new Promise(function(res, rej) {
			readStream = fs.createReadStream(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + "/quizMetadata.txt");
			readStream.on("ready", res);
			readStream.on("error", rej);
		});
	} catch (err) {
		if (err.code === "ENOENT") {
			res.writeHead(404, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"Quiz of code '" + req.query.qc + "' not found. Please check the quiz code and try again", state:"failure", data:null}));
		} else {
			res.writeHead(500, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"Failed to get quiz data", state:"failure", data:null}));
		}
		return;
	}
	if (req.query.metadata == "1" || req.query.socketStreamQuestions == "1") {
		res.writeHead(200, {"Content-Type":"application/json"});
		readStream.pipe(res);
		//socketStreamQuestions
		await new Promise(function(res, rej) {
			readStream.on("end", res);
		});
		readStream.destroy();
		if (req.query.socketStreamQuestions == "1") {
			//PART 2 of the operation - stream questions one by one
			//Add these two streams to the list of allocated streams for the socket only
			connectedSockets[req.session.socketid].allocatedStreams.push(readStream, lreader);
			//Send the questions line-by-line
			await new Promise(function(res, rej) {
				connectedSockets[req.session.socketid].on("startstream", res);
			});
			readStream = fs.createReadStream(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + "/quizQuestions.txt");
			var lreader = linereader.createInterface({
				input: readStream,
				crlfDelay: Infinity
			});
			lreader.isClosed = false;
			lreader.on("close", function() {lreader.isClosed = true});
			//Needs work...
			for await (var line of lreader) {
				//Wait until either the user receives them or something goes wrong
				if (lreader.isClosed) {
					//Stop reading quiz file and streamiing to client if reader is closed
					break;
				}
				connectedSockets[req.session.socketid].emit("stream", line);
				await new Promise(function(res, rej) {
					var successCallback = function() {
						connectedSockets[req.session.socketid].removeListener("streamreceived", successCallback);
						connectedSockets[req.session.socketid].removeListener("streamfailed", failureCallback);
						res();
					}, failureCallback = function() {
						connectedSockets[req.session.socketid].removeListener("streamreceived", successCallback);
						connectedSockets[req.session.socketid].removeListener("streamfailed", failureCallback);
						rej();
					}
					connectedSockets[req.session.socketid].on("streamreceived", successCallback);
					connectedSockets[req.session.socketid].on("streamfailed", failureCallback);
				});
			}

			//Inform client that all data has been streamed
			connectedSockets[req.session.socketid].emit("streamended");
			//Free all resources used during the operation - allow the GC to dispose of them
			connectedSockets[req.session.socketid].allocatedStreams.splice(connectedSockets[req.session.socketid].allocatedStreams.indexOf(readStream), 1);
			connectedSockets[req.session.socketid].allocatedStreams.splice(connectedSockets[req.session.socketid].allocatedStreams.indexOf(lreader), 1);
			lreader.close();
			readStream.destroy();
		}
	} else {
		var clientdateofbirth = await new Promise(async function(res, rej) {
			if (req.session.email != undefined) {
				var reader = fs.createReadStream(__dirname + "/server_data/signedupclients/" + encodeURIComponent(req.session.email).replace(/[*]/g, "%2A") + "/userStats.txt");
				reader.on("error", function(err) {
					if (err.code === "ENOENT") {
						res(Date.now());
					} else {
						rej(err);
					}
				});
				var lreader = linereader.createInterface({
					input: reader,
					crlfDelay: Infinity
				});
				parr.push(new Promise(function(res, rej) {reader.on("close", res)}), new Promise(function(res, rej) {lreader.on("close", res)}), new Promise(function(res, rej) {reader.on("close", res)}), new Promise(function(res, rej) {reader.on("close", res)}));
				let i = 0;
				lreader.on("line", function(data) {
					if (i === userAccountPropLines.DATEOFBIRTH) {
						res(data);
						reader.destroy();
						lreader.close();
						return;
					}
					i++;
				});
			} else {
				//Assume client is a newborn if (s)he has no account - better have an 18-year old shooing off butterflies and sunshine rainbows than a 5-year old being exposed to this harsh and petrifying reality
				res(Date.now());
			}
		});
		var bigString = "", metadata;
		readStream.on("data", function(data) {
			bigString += data;
		});
		await new Promise(function(res, rej) {
			readStream.on("end", res);
			readStream.on("error", rej);
		});
		readstream.destroy();
		metadata = JSON.parse(bigString);
		if (metadata.agerestriction * (1000*3600*24*365) > (Date.now() - clientdateofbirth) && metadata.agerestriction > 0) {
			//Age checking - too young
			res.writeHead(403, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"This quiz's age restrictions are beyond your current age and/or you are not signed in to an account!", state:"failure", data:null}));
		} else if (metadata.privatequiz && metadata.allowedparticipants.indexOf(req.session.email) === -1) {
			//Quiz privacy checking - user not allowed to join
			res.writeHead(403, {"Content-Type":"application/json"});
			res.end(JSON.stringify({error:"This quiz is private and you are either not in the allowed emails list and/or you are not signed in to an account!", state:"failure", data:null}));	
		} else {
			var lines = [];
			var readStream = fs.createReadStream(__dirname + "/server_data/existingquizzes/" + encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A") + "/quizQuestions.txt");
			var lreader = linereader.createInterface({
				input: readStream,
				crlfDelay: Infinity
			});
			let i = 0;
			lreader.on("line", function(line) {
				if (i >= req.query.firstQuestionIndex && i < parseInt(req.query.firstQuestionIndex) + parseInt(req.query.numQuestions)) {
					lines.push(JSON.parse(line));
				}
				if (i == parseInt(req.query.firstQuestionIndex) + parseInt(req.query.numQuestions)) {
					lreader.close();
					readstream.destroy();
					return;
				}
				i++;
			});
			lreader.on("close", function() {
				res.writeHead(200, {"Content-Type":"application/json"});
				res.end(JSON.stringify({error:null, state:"success", data:lines}));
			});
		}
	}
});*/

app.get("/fetchDetailedResponse", function(req, res) {
	//Attempt to create a readstream to the specified file
	let rs = fs.createReadStream(`${__dirname}/server_data/quiz_taker_answers_temp/${encodeURIComponent(req.query.responseID).replace(/[*]/g, "%2A")}.txt`);
	//Set the appropriate headers without finalising them (i.e.: in the case of error, they would be susceptible to change)
	res.setHeader("Content-Type", "text/html");
	res.status(200);
	rs.pipe(res);
	rs.on("end", function() {
		res.end();
		rs.destroy();
	})
	rs.on("error", function(err) {
		rs.destroy();
		if (err.code == "ENOENT") {
			res.writeHead(404, {"Content-Type": "text/plain"});
			res.end("The specified quiz response file was not found");
		} else {
			console.log(err);
			res.writeHead(500, {"Content-Type": "text/plain"});
			res.end("Something went wrong while retrieving the quiz response file");
		}
	});
});

//Faster and more efficient way to get the metadata of a quiz and its creator
app.get("/getquizdata", async function(req, res) {
	//TODO: Handle userID: NULL field when retrieving quiz creator's data, caused by account deletion
	let quizDataObj = {};
	let quizDataArr = await queryDB(`SELECT * FROM quiz WHERE quizCode = ?`, [req.query.qc]);
	//ageRestriction, privateQuiz, allowedParticipantsListJSON, sendAnswers, answersRecipient, among others...
	if (quizDataArr.length === 0) {
		//The quiz does not exist
		res.writeHead(404, {"Content-Type":"text/plain"});
		res.end("The quiz you have specified does not exist or cannot be found");
		return;
	} else if (quizDataArr.length > 1) {
		//Catastrophic error: Multiple quizzes share the quiz code
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("Catastrophic server-side error: This quiz code has duplicates in the DB. Server crashing...");
		throw new CatastrophicError("Catastrophic server-side error: This quiz code has duplicates in the DB. Server crashing...");
	}
	quizDataObj.quizData = quizDataArr[0];

	let cookies = getCookies(req);
	let userEmail = sessionIDEmailMap.get(cookies.sessionid);
	//Check if the user also wants to retrieve the questions and check if he may do so
	if (Number(req.query.getquestions) === 1) {
		//Check if logged in session is still valid
		await updateSessionID(cookies.sessionid);
		if (userEmail == undefined) {
			//User is not logged in. User must be logged in to the quiz creator's account in order to be able to retrieve all of a quiz's questions without taking part in a quiz, to eliminate cheating.
			res.writeHead(401, {"Content-Type":"text/plain"});
			res.end("You cannot retrieve this quiz's questions since you are not logged in to the quiz creator's account");
			return;
		}
		let userDBID;
		if (emailDBRecordMap.get(userEmail) == undefined) {
			//Must retrieve user's DB-ID from the database
			userDBID = await queryDB(`SELECT userID FROM user WHERE emailAddress = ?`, [userEmail]);
			if (userDBID.length < 1) {
				//The user does not exist, but this was retrieved server-side, so something is horribly wrong. Return error code and stop method execution.
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Something went wrong server-side! Very probably not your fault");
				return;
			} else if (userDBID.length > 1) {
				//Something is terribly, terribly wrong (multiple users with the same email address). Throw a fatal server-side error
				res.writeHead(500, {"Content-Type":"text/plain"});
				res.end("Multiple users have the same email address (inside DB)");
				throw new CatastrophicError("Multiple users have the same email address (inside DB)");
				//No need for return; the error stops execution of this function and propagates up the stack
			}
			emailDBRecordMap.set(userEmail, userDBID[0].userID);
		}
		//One can assume that data has been added to the map here
		userDBID = emailDBRecordMap.get(userEmail);
		if (quizDataObj.quizData.userID !== userDBID) {
			//The user is logged in, but not to the quiz creator's account
			res.writeHead(401, {"Content-Type":"text/plain"});
			res.end("You cannot retrieve this quiz's questions since you are not its creator.");
			return;
		}
	}

	//No need to validate user login to retrieve questions, since it has already been done. Should there be any violations, code byond this point would not be executed

	//Attempt to retrieve data about the quiz creator
	let creator = (await queryDB(`SELECT emailAddress, userName, dateOfBirth, profilePic, personalDescription FROM user WHERE userID = ?`, [quizDataObj.quizData.userID]))[0];
	if (creator == undefined) {
		//Quiz creator not found - do not throw an error, since quiz data would have been found. Instead, return an error object in the place of the object storing the quiz creator's data
		quizDataObj.creatorData = {error: "No such creator exists"};
	} else {
		//Quiz creator found
		quizDataObj.creatorData = creator;

		//Mask the userID from the client
		quizDataObj.creatorData.userID = undefined;
	}

	//Do not mask these until AFTER the validation checks and the retrieval operations, for the aforementioned operations would rely on the masks, yielding erroneous results
	quizDataObj.quizData.quizID = undefined;
	quizDataObj.quizData.userID = undefined;

	if (Number(req.query.getquestions) === 1) {
		//Wait for socket to send "ready" message
		if (userEmail == undefined) {
			//Logged-out client identified through session id
			var userSocket = connectedSocketsMap.get(sessionIDSocketIDMap.get(cookies.sessionid));
		} else {
			var userSocket = connectedSocketsMap.get(emailSocketIDMap.get(userEmail));
		}
		if (cookies.sessionid == undefined) {
			//User cannot be identified: no sessionid cookie
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("You have no sessionid cookie and thus cannot be identified! Please enable cookies or contact us for more advice.");
			return;
		} else if (userSocket == undefined) {
			console.log(cookies.sessionid, sessionIDSocketIDMap, connectedSocketsMap);
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Something went wrong on the server-side! Please refresh the page and try again.");
			return;
		}

		//Function to return a custom function to listen for a custom socket event
		var socketPromiseFunctionGenerator = function(eventName = "", timeoutms = 5000) {
			return function(res, rej) {
				let successHandler = function(data) {
					removeListeners();
					res(data);
				}
				let failureHandler = function(err) {
					removeListeners();
					rej(err);
				}
				let removeListeners = function() {
					resolved = true;
					clearTimeout(timeoutID);
					userSocket.removeListener(eventName, successHandler);
					userSocket.removeListener("disconnect", failureHandler);
					//Reset to the original termination hander function, which should NEVER EVER BE CHANGED, EVER!!!
				}
				userSocket.on(eventName, successHandler);
				userSocket.on("disconnect", failureHandler);
				let timeoutID;
				if (timeoutms !== -1) {
					//Do not use errors except for during disconnects, due to their relatively high cost
					timeoutID = setTimeout(successHandler, timeoutms, {errorCode:"responseTimeout", error: "Response timeout: no data within the specified interval has been received"});
				}
				//VERY IMPORTANT: Put this clause after all the function declarations for the newly-declared functions to be accessible to it and prevent reference errors
				//This clause checks if termination has been signalled while there were no listeners or available functions
			}
		}
		var latestPromise = new Promise(socketPromiseFunctionGenerator("readyStream", 5000));
	}

	//Success! (or partial success) Return the retrieved data
	res.writeHead(200, {"Content-Type":"application/json"});
	res.end(JSON.stringify(quizDataObj));
	
	try {
		if (Number(req.query.getquestions) !== 1) {
			return;
		}
		//Ensure that the user is ready to begin receiving parts of the stream
		await latestPromise;
	
		//Only proceed if the user wishes to (and is allowed to) retrieve the question data
		//Create a socket stream
		let questionData;
		for (let i = 0; i < quizDataObj.quizData.numQuestions; i++) {
			questionData = (await queryDB(`SELECT * FROM question WHERE quizCode = ? AND questionNumber = ?`, [req.query.qc, i]))[0];
			questionData.questionNumber = undefined;
			//(Re)send the message periodically (every 5 seconds) until the user disconnects or acknowledges receipt of the question
			do {
				//Iterate over the questions and send them to the client
				//Mask this value from the client
				latestPromise = new Promise(socketPromiseFunctionGenerator("questionReceived", 5000));
				userSocket.emit("questionData", JSON.stringify(questionData));
				let data = await latestPromise;
				if (typeof data === "string") {
					try {
						if (JSON.parse(data).errorCode !== "responseTimeout") {
							//If the user acknowledges successful message
							break;
						}
					} catch (e) {
						console.log(e);
					}
				} else {
					//Break if the user acknowledges successful message, which can be undefined (no message at all). Not due to socket timeout
					break;
				}
			} while (true);
		}
		//Attempt to notify the client that the stream is ready
		userSocket.emit("streamReady");
	} catch (e) {
		console.log(e);
	}
});

/**The metadata returned here is special; it also includes the current question*/
app.post("/joinquiz", async function(req, res) {
	//Check whether user can join quiz. If so, create a server-side quiz session which controls the questions sent to the client
	let quizDataArr = await queryDB(`SELECT * FROM quiz WHERE quizCode = ?`, [req.query.qc]);
	//ageRestriction, privateQuiz, allowedParticipantsListJSON, sendAnswers, answersRecipient
	if (quizDataArr.length === 0) {
		//The quiz does not exist
		res.writeHead(404, {"Content-Type":"text/plain"});
		res.end("The quiz you have specified does not exist or cannot be found");
		return;
	} else if (quizDataArr.length > 1) {
		//Catastrophic error: Multiple quizzes share the quiz code
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("Catastrophic server-side error: This quiz code has duplicates in the DB. Server crashing...");
		throw new CatastrophicError("Catastrophic server-side error: This quiz code has duplicates in the DB. Server crashing...");
	}
	let quizData = quizDataArr[0];
	quizData.quizID = undefined;
	//Get the user's email, if applicable
	let cookies = getCookies(req);
	let userEmail = sessionIDEmailMap.get(cookies.sessionid);
	if (quizData.ageRestriction > 0 || quizData.privateQuiz || quizData.sendAnswers) {
		//If either of these holds true, joining the quiz will require authentication
		if (userEmail == undefined) {
			//No authentication; cannot join quiz
			res.writeHead(401, {"Content-Type":"text/plain"});
			res.end("This quiz requires authentication (being logged in) to take");
			return;
		}
		let playerData = await queryDB(`SELECT dateOfBirth FROM user WHERE userID = ?`, [emailDBRecordMap.get(userEmail)]);
		//Return an error if the specified userID does not exist in the DB
		if (playerData[0] == undefined) {
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Something went wrong whilst joining the quiz");
			return;
		}
		//Create a reference to the zeroth element from now (while making the now useless array eligible for garbage collection) for more concise and readable code
		playerData = playerData[0];
		//Check if user meets age requirements
		if (new Date(playerData.dateOfBirth).getFullYear() < quizData.ageRestriction) {
			//Quiz applicant is underage - deny entry
			res.writeHead(403, {"Content-Type":"text/plain"});
			res.end(`You cannot join this quiz because you are underage and do not satisfy the minimum age requirement of ${quizData.ageRestriction} years.`);
			return;
		}
		//Check if the quiz is private and handle data accordingly
		try {
			if (quizData.privateQuiz) {
				if (JSON.parse(quizData.allowedParticipantsListJSON).indexOf(userEmail) === -1) {
					//The quiz is private and the user's email is not within the list
					res.writeHead(403, {"Content-Type":"text/plain"});
					res.end("You cannot join this quiz for it is private and your email address has not been selected among the allowed quiz participants");
					return;
				}
			}
		} catch (e) {
			//Potential error when parsing JSON
			console.log(e);
			res.writeHead(500, {"Content-Type":"text/plain"});
			res.end("Something went wrong whilst joining this quiz");
			return;
		}
	}
	
	//Join the quiz and make the appropriate server-side changes
	//First, look for an existing quiz

	//Function to save current quiz state and delete the session from the map in case of unexpected error or condition before termination IF AND ONLY IF the user is logged in
	let saveProgress = async function(session) {
		if (userEmail != undefined) {
			//Centralised function involving saving quiz data to DB, in accordance with the DRY (Don't Repeat Yourself) proocedures
			await saveQuizSession(session);
			if (session === emailQuizSessionMap.get(userEmail)) {
				//Prevent this from deleting the wrong quiz session: this would cause a catastrophe. Besides, map value access time complexity should be O(1) [Needs verification]
				emailQuizSessionMap.delete(userEmail);
			}
		}
	}

	//Session checks: only save progress if user is logged in
	let quizSession;
	if (userEmail != undefined) {
		let existingSession = await queryDB(`SELECT * FROM quizsession WHERE quizCode = ? AND emailAddress = ?`, [req.query.qc, userEmail]);
		if (existingSession.length === 1) {
			//This session exists: retrieve it
		//} else if (existingSession.length > 1) {
			/*existingSession[0].answersLogFileDir = existingSession[0].tempAnswersLogFileDir;
			existingSession[0].questionOrder = JSON.parse(existingSession[0].questionsOrderJSON);*/
			quizSession = QuizSession.fromObject({
				quizCode: existingSession[0].quizCode,
				emailAddress: existingSession[0].emailAddress,
				quizQuestionIndex: existingSession[0].questionIndex,
				questionOrder: JSON.parse(existingSession[0].questionsOrderJSON),
				answersLogFileDir: existingSession[0].tempAnswersLogFileDir,
				quizPoints: existingSession[0].quizPoints, //TODO: Cast this to a number
				numCorrectAnswers: existingSession[0].numCorrectAnswers
			});
		} else {
			quizSession = new QuizSession(req.query.qc, userEmail, 0, `${__dirname}/server_data/quiz_taker_answers_temp/${encodeURIComponent(userEmail).replace(/[*]/g, "%2A")},${encodeURIComponent(req.query.qc).replace(/[*]/g, "%2A")}.txt`, 0, 0, []);
			//Generate an ordered list of indices, representing the order of questions to be asked, determined by by id	
			for (let i = 0; i < quizData.numQuestions; i++) {
				quizSession.questionOrder.push(i);
			}
			//Shuffle the order of questions to prevent cheating and copying
			fisherYatesShuffle(quizSession.questionOrder);
		}
		let oldSession = emailQuizSessionMap.get(userEmail);
		if (oldSession != undefined && oldSession.quizCode !== req.query.qc) {
			//The user is currently taking part in another quiz. Unload the quiz session data from memory and place it in the DB for future access IF IT IS NOT OF THE CURRENT QUIZ CODE
			await saveProgress(oldSession);
			/*await queryDB(`INSERT INTO quizsession (quizCode, emailAddress, questionIndex, questionsOrderJSON, tempAnswersLogFileDir)
				VALUES (?, ?, ?, ?, ?)`, [oldSession.quizCode, oldSession.emailAddress, oldSession.quizQuestionIndex, JSON.stringify(oldSession.questionOrder), oldSession.answersLogFileDir]);*/
			//TODO: TERMINATE THE QUIZ HERE
			//Function to signal the termination of old quiz context

			//Ensure that code executed beyond this function's invocation with respect to the old quiz will never require the quiz session map's old value
			oldSession.terminate();
		}
		//Write the new quiz session to the map, IF AND ONLY IF THE USER IS LOGGED IN
		emailQuizSessionMap.set(userEmail, quizSession);
	} else {
		//This object is merely used for storing question order and send time when the user is not logged in; NO DATA IS SAVED IF THAT IS SO, FOR THERE WOULD BE NO WAY TO IDENTIFY THE LOGGED-OUT USER BEYOND THE SESSION
		quizSession = new QuizSession(req.query.qc, undefined, 0, undefined, 0, 0, []);
		//Generate an ordered list of indices, representing the order of questions to be asked, determined by by id	
		for (let i = 0; i < quizData.numQuestions; i++) {
			quizSession.questionOrder.push(i);
		}
		//Shuffle the order of questions to prevent cheating and copying
		fisherYatesShuffle(quizSession.questionOrder);
	}
	//Specify the current question index in the response
	quizData.currentQuestionIndex = quizSession.quizQuestionIndex;
	//Flag to signal the graceful termination of the quiz
	let terminateQuiz = false;
	quizSession.origTerminate = function() {
		terminateQuiz = true;
	}
	quizSession.terminate = quizSession.origTerminate;

	//Wait for socket to send "ready" message
	if (userEmail == undefined) {
		//Logged-out client identified through session id
		var userSocket = connectedSocketsMap.get(sessionIDSocketIDMap.get(cookies.sessionid));
	} else {
		var userSocket = connectedSocketsMap.get(emailSocketIDMap.get(userEmail));
	}
	if (cookies.sessionid == undefined) {
		//User cannot be identified: no sessionid cookie
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("You have no sessionid cookie and thus cannot be identified! Please enable cookies or contact us for more advice.");
		return;
	} else if (userSocket == undefined) {
		console.log(cookies.sessionid, sessionIDSocketIDMap, connectedSocketsMap);
		res.writeHead(500, {"Content-Type":"text/plain"});
		res.end("Something went wrong on the server-side! Please refresh the page and try again.");
		return;
	}

	//WHAT THE HECK IS THIS???? AAAARRRRGGHHHHHH!!!!
	//Function to return a custom function to listen for a custom socket event
	let socketPromiseFunctionGenerator = function(eventName = "", timeoutms = 5000) {
		return function(res, rej) {
			let resolved = false;
			//Mechanism to prevent undefined behaviour due to calling res after promise resolution. THIS FUNCTION'S COPY SHOULD NEVER BE INVOKED
			quizSession.terminate = function() {
				if (resolved) {
					successHandler({errorCode:"quizOverwritten", error: "The user joined a new quiz whilst this one was in use"});
				}
			}
			let successHandler = function(data) {
				removeListeners();
				res(data);
			}
			let failureHandler = function(err) {
				removeListeners();
				rej(err);
			}
			let removeListeners = function() {
				resolved = true;
				clearTimeout(timeoutID);
				userSocket.removeListener(eventName, successHandler);
				userSocket.removeListener("disconnect", failureHandler);
				//Reset to the original termination handler function, the reference to which should NEVER EVER BE CHANGED, EVER!!!
				quizSession.terminate = quizSession.origTerminate;
			}
			userSocket.on(eventName, successHandler);
			userSocket.on("disconnect", failureHandler);
			let timeoutID;
			if (timeoutms !== -1) {
				//Do not use errors except for during disconnects, due to their relatively high cost
				timeoutID = setTimeout(successHandler, timeoutms, {errorCode:"responseTimeout", error: "Response timeout: no data within the specified interval has been received"});
			}
			//VERY IMPORTANT: Put this clause after all the function declarations for the newly-declared functions to be accessible to it and prevent reference errors
			//This clause checks if termination has been signalled while there were no listeners or available functions
			if (terminateQuiz) {
				quizSession.terminate();
			}
		}
	}

	
	//Create the promise before sending the response in order to avoid race conditions. Using this technique, if the promise were to be fulfilled before the await clause, instead of a deadlock, the resolved promise's value would be immediately retrieved
	let latestPromise = new Promise(socketPromiseFunctionGenerator("ready"));

	//Send the quiz's metadata to the client, for reference and display purposes ONLY. Only do this if the client is eligible to join the quiz
	res.writeHead(200, {"Content-Type":"application/json"});
	res.end(JSON.stringify(quizData));

	let question, answer;
	//Wait until ready event is submitted (created before sending the http response)
	await latestPromise;
	//Declare this here for its scope to be accessible to both the 'try' and 'finally' blocks
	let answersFileWriteStream;
	let writeToFileAsync;
	//Only do this if the user can be identified
	//TODO: Allow non-signed-in users to receive their results by identifying them through their session ids (if they leave the quiz, the file containing their answers will be deleted)
	if (userEmail != undefined) {
		//A stream to write users' answers and correct answer(s) to files in order to prevent them from hogging up server memory, which may as well be more valuable than a cubic metre of gold at S.T.P
		answersFileWriteStream = fs.createWriteStream(quizSession.answersLogFileDir, {flags:'a'});
		writeToFileAsync = function(data) {
			return new Promise(function(res, rej) {
				answersFileWriteStream.write(data, function(err) {
					if (err) {
						rej(err);
					} else {
						res();
					}
				});
			});
		}
	}
	//TODO: If the client joins a new quiz whilst the current one is in progress, forcefully abort the question-sending loop
	//Make it accessible to both the try and final blocks
	let i;
	try {
		//Start from the last performed question. For newly-joined quizzes, this should always be zero. For saved quiz sessions, this can be any positive integer between zero and the number of questions in the quiz minus one
		let pointsGained;
		let initQuizQuestionIndex = quizSession.quizQuestionIndex;
		//Only do this for the FIRST question (relative to the whole quiz, not saved progress) and if the user is logged in
		if (userEmail != undefined && initQuizQuestionIndex === 0) {
			await writeToFileAsync("<div class = \"mainDiv\">");
		}
		for (i = quizSession.quizQuestionIndex; i < quizSession.questionOrder.length; i++) {
			//If this were not so, the pointsGained value would be cached until the next correct answer
			pointsGained = 0;
			//Send a signal to the client to begin the countdown from 3 at the first question
			if (i === initQuizQuestionIndex) {
				console.log("Performing countdown...");
				latestPromise = new Promise(socketPromiseFunctionGenerator("countdownReady", 9000 /*9 seconds: 4-second countdown (3, 2, 1, GO!) plus 5-second headroom*/));
				userSocket.emit("initiateCountdown");
			}
			//readyQuestion listener is prepared on the other end
			await latestPromise;

			question = (await queryDB(`SELECT * FROM question WHERE quizCode = ? AND questionNumber = ?`, [quizSession.quizCode, quizSession.questionOrder[i]]))[0];
			//DO NOT GIVE THE CLIENT THE ANSWER UNTIL AFTER THE QUESTION HAS BEEN ANSWERED
			//Do not store the answers in memory for very long, for they could theoretically be huge. (manual memory deallocation would be helpful here...) Requests to the indexed DB should be blazing fast
			delete question.correctOptionsJSON;
			//Prevent the client from getting the REAL order of questions through a mask
			question.questionNumber = i;
			userSocket.emit("question", question);
			//TODO: Ensure that the user has received the question before starting the timer to determine points obtained. Do this through waiting for a client-side response acknowledging data receipt. If said response does not arrive within a given interval, resend the data. Repeat FIVE times in total, and if no acknowledgement of receipt is received, kick the client and state that it was due to connectivity errors
			quizSession.questionStartTime = Date.now();

			//If the client disconnects, these would reject and throw an error
			if (question.timeLimit === -1 || !quizData.doTimeLimit) {
				//No time limit
				answer = await new Promise(socketPromiseFunctionGenerator("answer", -1));
			} else {
				//5 seconds extra, to have enough time to transmit the client's response to the server after the time limit. If the client hacks itself in an attempt to get infinite time, it will only get an extra 5 seconds, which would have been used to ensure that the data would have been transmitted in time
				answer = await new Promise(socketPromiseFunctionGenerator("answer", question.timeLimit + 5000));
			}
			//Handle responses conveying errors
			if (typeof answer === "object") {
				switch (answer.errorCode) {
					case "responseTimeout":
						//Response timed out! Assume that the client is not ready to start the quiz. Save and delete quiz sessions accordingly (done)
						//TODO: Do something! Either kick the user and mark the question as undone (by not incrementing the question index) and not save it, to be redone on rejoining OR mark the answer incorrect by delivering a blank answer
						//This code would only execute 5 seconds after the time limit. If clients running the quiz app as intended do not submit the answer on time, assuming timely data transmission, their answer would simply be marked wrong (for multiple-choice answers) or sent as-is (in the case of text answers)

						

						//No need for either the 'break' or 'return' statements here. Both "responseTimeout" and "quizOverwritten" fail the same way
					case "quizOverwritten":
						//The user is attempting to join a quiz whilst already in one!
						//Only save and delete progress from map if user is logged in (validation is performed inside function, for this must ALWAYS hold true)
						//TODO: Check if progress is saved elsewhere (i.e.: before terminate() is invoked)
						await saveProgress(quizSession);
						//No need for the 'break' statement here. Returns from entire function scope.
						//STOP QUIZ LOOP IMMEDIATELY for this particular client, to prevent inconsistent state and nightmarishly impossible (difficult to deal with -> (isolate, reproduce and patch)) bugs
						return;
				}
			}

			//This should be an array; all user input is validated server-side
			let correctAnswers = JSON.parse((await queryDB(`SELECT correctOptionsJSON FROM question WHERE quizCode = ? AND questionNumber = ?`, [quizSession.quizCode, quizSession.questionOrder[i]]))[0].correctOptionsJSON);

			//This can only be done if the user is logged into an account
			var correct;
			if (userEmail != undefined) {
				//Write the data of this particular question to the file
				await writeToFileAsync(`<div class = "questionContainer"><div class = "question">Question ${i + 1}: "${question.questionHTMLSanitised}"</div>\n`);
				//This will be declared throughout the scope
				let answerString;
				//These are copies (or alternative references, as the case may be) of the original arrays, meant to preserve the original response data whilst supplying potentially different data for comparisons in the case of questions whose responses are not case-sensitive
				let answerCaseCopy, correctAnswersCaseCopy = [];
				if (!question.caseSensitive && question.questionType === "textchoice") {
					//Check answer without case-sensitivity. This only applies when the question has no options, for performance optimisation and the fact that for options, a lack of case sensitivity is redundant
					answerCaseCopy = answer.toLowerCase();
					for (let i = 0; i < correctAnswers.length; i++) {
						correctAnswersCaseCopy.push(correctAnswers[i].toLowerCase());
					}
				} else {
					//Check answer with case-sensitivity
					correctAnswersCaseCopy = correctAnswers;
					answerCaseCopy = answer;
				}
				if (correctAnswersCaseCopy.indexOf(answerCaseCopy) === -1) {
					//Incorrect answer
					correct = false;
					answerString = "<span class = \"incorrectAnswer\">incorrectly</span>";
				} else {
					//Correct answer
					correct = true;
					//Increment the number of correct answers
					quizSession.numCorrectAnswers++;
					answerString = "<span class = \"correctAnswer\">correctly</span>";
				}
				await writeToFileAsync(`<div class = "userAnswerCorrectness">Quiz taker has answered this question ${answerString}</div>`);
				await writeToFileAsync(`<div class = "userAnswer">Quiz taker's answer: ${answer}</div>`);
				if (correctAnswers.length === 1) {
					//Single correct answer
					await writeToFileAsync(`<div class = "correctAnswerDisplay">Correct answer:\n<div class = "correctAnswer">${correctAnswers[0]}</div></div>`);
				} else {
					//Mutiple correct answers
					await writeToFileAsync(`<div class = "correctAnswerDisplay">Correct answers:\n`);
					for (let i = 0; i < correctAnswers.length; i++) {
						//TODO: Optimise out this regexp!!!
						if (i === correctAnswers.length - 1) {
							//Last entry; no need for comma
							await writeToFileAsync(`<div class = "correctAnswer">${correctAnswers[i].replace(/[\n]/g, "<br />")}</div>`);
						} else {
							await writeToFileAsync(`<div class = "correctAnswer">${correctAnswers[i].replace(/[\n]/g, "<br />")}</div>`);
						}
					}
					//Close off correct answer display div
					await writeToFileAsync(`</div>`);
				}
				//Close off question div
				await writeToFileAsync(`</div>`);
			} else {
				let answerCaseCopy, correctAnswersCaseCopy = [];
				if (!question.caseSensitive && question.questionType === "textchoice") {
					//Check answer without case-sensitivity. This only applies when the question has no options, for performance optimisation and the fact that for options, a lack of case sensitivity is redundant
					answerCaseCopy = answer.toLowerCase();
					for (let i = 0; i < correctAnswers.length; i++) {
						correctAnswersCaseCopy.push(correctAnswers[i].toLowerCase());
					}
				} else {
					//Check answer with case-sensitivity
					correctAnswersCaseCopy = correctAnswers;
					answerCaseCopy = answer;
				}
				if (correctAnswersCaseCopy.indexOf(answerCaseCopy) === -1) {
					//Incorrect answer
					correct = false;
				} else {
					//Correct answer
					correct = true;
					//Increment the number of correct answers
					quizSession.numCorrectAnswers++;
				}
			}

			//DO NOT move the DB query to get the correct answers here; code preceding this requires the correct answers to determine whether the provided answer is correct. If the array were empty, it would make the client and server (mistakenly) believe that the client's answer is always incorrect
			if (!quizData.showCorrectAnswers) {
				//The answer's veracity would have already been computed and is ALWAYS required by the server. This is to mask the correct answers should the quiz creator not wish to disclose them, possibly to combat cheating
				correctAnswers = [];
			}

			//DO NOT USE AN ELSE-IF CLAUSE HERE; IT WILL ONLY EXECUTE THE BELOW IF THE RESPONSE IS NOT an object, when the below should always execute unless an error response is given
			if (quizData.showPoints && correct) {
				//Record points
				//This variable stores the client's points.
				if (quizData.timeLimit) {
					pointsGained = Math.max((Date.now() - quizSession.questionStartTime) * question.maxpoints/question.timeLimit, 0);
				} else {
					pointsGained = Math.max(question.maxpoints, 0);
				}
				quizSession.quizPoints += pointsGained;
			}

			//Only do this up until the penultimate question, for after the final question the "readyQuestion" event would never be sent again for that particular quiz session
			if (i < quizSession.questionOrder.length - 1) {
				//Ensure that the user is ready to receive the next question
				latestPromise = new Promise(socketPromiseFunctionGenerator("readyQuestion", -1 /*Wait indefinitely, due to varying client-side animation durations. If the socket were to disconnect, an error would still be thrown*/));
			} else if (i === quizSession.questionOrder.length - 1) {
				//Last iteration; no more questions
				latestPromise = new Promise(socketPromiseFunctionGenerator("readyResponse", -1));
			}
			//Send the client the correct answer(s), along with their points. If the quiz creator did not wish to show points, the variable will still be sent, but it will contain no useful information (value not used and therefore stuck at zero)
			userSocket.emit("correctAnswer", JSON.stringify({correctAnswers, correct, showPoints: quizData.showPoints, points: quizSession.quizPoints, pointsGained}));
			//At the end, increment the quiz question index
			quizSession.quizQuestionIndex++;
		}
	} catch (e) {
		//TODO; fix this
		//Typically caused due to the client disconnecting
		console.log(e);
	}

	let newFileID;
	//Only do this if the quiz has finished, regardless of user state (i.e.: logged in or logged out)
	if (i === quizSession.questionOrder.length) {
		let resultantGrade = 0, gradeComment = "";
		if (quizData.showGrade) {
			//Do this here, not during grade incrementation
			resultantGrade = quizSession.numCorrectAnswers;
			//Only check this if showGrade is true
			if (quizData.showGradeComment) {
				//Get the array of comments and mark ranges
				let gradeCommentRangesArr = JSON.parse(quizData.resultHTMLCommentRangesJSON);
				for (let i = 0; i < gradeCommentRangesArr.length; i++) {
					let range = gradeCommentRangesArr[i];
					if (quizSession.numCorrectAnswers >= range.min && quizSession.numCorrectAnswers <= range.max) {
						//This is the first comment whose mark bounds are satisfied by the quiz taker's mark! Stop at the first one found!
						gradeComment = range.comment;
						break;
					}
				}
			}
		}
		//This does not belong in the next "if (userEmail != undefined)" block, since this has an "else" statement to define the newFileID variable in both cases, since it will be involved in the immediate quiz results
		if (userEmail != undefined) {
			do {
				newFileID = createUUID();
			} while (await new Promise(function(res, rej) {
				fs.access(`${__dirname}/server_data/quiz_taker_answers_temp/${newFileID}.txt`, function(err) {
					if (err) {
						//File does not exist
						res(false);
					} else {
						//File does exist
						res(true);
					}
				});
			}));
			//Rename the file with a unique ID
			var err = await new Promise(function(res, rej) {
				fs.rename(quizSession.answersLogFileDir, `${__dirname}/server_data/quiz_taker_answers_temp/${newFileID}.txt`, function(err) {
					if (err) {
						res(err);
					} else {
						res();
					}
				});
			});
			if (err) {
				console.log(err);
				newFileID = undefined;
			}
		} else {
			//No file, since user is not signed in
			newFileID = "";
		}
		//Await the promise confirming client readiness AFTER sending the notification, for hacked clients may never request their results, delaying their receipt by the creator. (They would still be sent, eventually, due to the timeout)
		await latestPromise;
		let obj = {
			points: quizSession.quizPoints,
			grade: resultantGrade,
			gradeComment,
			questionAnswersID:newFileID,
			isLoggedIn: userEmail != undefined
			//If quiz creator did not wish to publicise the points, the value will be zero.
		}
		//Mask the correct answers from the user, not the quiz creator
		if (!quizData.showCorrectAnswers) {
			obj.questionAnswersID = "";
		}
		for (let i = 0; i < 10; i++) {
			let successPromise = new Promise(socketPromiseFunctionGenerator("resultsReceived"), 5000);
			userSocket.emit("quizResults", JSON.stringify(obj));
			let data = await successPromise;
			//variable "data" is not necessarily of type boolean, therefore "if (data)" would treat data as true unless its value were among a select set of falsy values such as 0, null, false and undefined
			if (data === true) {
				//Success; break!
				break;
			}
		}
		if (userEmail != undefined) {
			//If applicable (i.e.: quiz has been completed), delete the quiz session stored in the db
			await queryDB(`DELETE FROM quizsession WHERE quizCode = ? AND emailAddress = ?`, [req.query.qc, userEmail]);
		}
	}

	//If the user were not logged in, the file stream could not have possibly been created
	if (userEmail != undefined) {
		//Save the user's quiz progress
		//This happens afer the FINAL loop has been COMPLETED; the counter would be incremented one last time and the loop would be exited
		if (i === quizSession.questionOrder.length) {
			sendNotificationBlock: {
				//Quiz complete! Send quiz results
				await writeToFileAsync("</div>");
				answersFileWriteStream.destroy();
				//TODO: Finish the object and copy it over to the other side

				//Send the quiz creator a notification, if applicable
				if (quizData.sendAnswers) {
					let usernames = (await queryDB(`SELECT username FROM user WHERE emailAddress = ?`, [quizData.answersRecipient]));
					let username, userData;
					let answersRecipient;
					let redirected = false;
					if (usernames.length === 0) {
						//The specified user does not exist - attempt to redirect results statement
						userData = (await queryDB(`SELECT emailAddress, username FROM user WHERE emailAddress = ?`, [quizData.userID]));
						redirected = true;
					} else {
						//The email address stated within answersRecipient is valid
						username = usernames[0].username;
						answersRecipient = quizData.answersRecipient;
					}
					//I could use a nested "if" statement here, but...
					if (redirected && userData.length === 0) {
						//Quiz creator's address does not exist either - do not send notification, but do send the quiz taker his/her results!
						break sendNotificationBlock;
					} else if (redirected) {
						//The email address stated within answersRecipient is not valid, mandating a redirect: the notification would be sent to the quiz's creator
						username = userData[0].username;
						answersRecipient = userData[0].emailAddress;
					}
					
					let pointsElem = "";
					if (quizData.showPoints) {
						pointsElem = `<span class = "paragraph">Points: ${quizSession.quizPoints}</span>`;
					}
					sendNotification("noreply@quizdom.com", answersRecipient, `Quiz Results from email address ${userEmail}`, `
						<p>${username},</p>
						<p>The user "${userEmail}" has submitted their response to your quiz titled "${quizData.quizTitle}". You can view the basic information below, or click 'More Details' for more comprehensive details on the quiz taker's performance</p>
						<div class = "details">
							<p class = "paragraph">Mark: ${quizSession.numCorrectAnswers}/${quizSession.questionOrder.length} (${Math.round((quizSession.numCorrectAnswers/quizSession.questionOrder.length)*100)}%)</p>
							${pointsElem}
							<button class = "moreDetails" detailsID = "${newFileID}">More Details</button>
						</div>
					`);
				}
				/*try {
					let readStream;
					/*if (userEmail != undefined) {
						//TODO: Send this file through a NOTIFICATION and stream
						readStream = fs.createReadStream(quizSession.answersLogFileDir);
						readStream.hasEnded = false;
						//TODO: Pay attention to the 5000ms delay
						latestPromise = new Promise(socketPromiseFunctionGenerator("readyStream", 5000));
						userSocket.emit("quizResults", JSON.stringify({
							points: quizSession.quizPoints,
							grade: resultantGrade,
							gradeComment,
							//If user did not wish to share the points, the value will be zero.
						}));
						await latestPromise;

						const bufArr = [];
						readStream.on("data", function(data) {
							bufArr.push(data);
							dataPromise = new Promise(function(res, rej) {
								readStream.once("data", res);
							});
						});

						let readStreamPaused = false, receiptPromise;
						//Resolves whenever the readstream produces new data
						let dataPromise = new Promise(function(res, rej) {
							readStream.once("data", res);
						});
						while (!readStream.hasEnded || bufArr.length > 0) {
							//Backpressure handling technique
							if (bufArr.length <= 2 && !readStream.isPaused()) {
								readStream.resume();
							}
							if (bufArr.length < 2) {
								//Nothing to do: wait until more data is fetched
								await dataPromise;
							} else if (bufArr.length > 2 && !readStream.isPaused()) {
								readStream.pause();
							}
							receiptPromise = new Promise(socketPromiseFunctionGenerator("streamDataReceived", 5000));
							userSocket.emit("answersStream", bufArr[0]);
							await receiptPromise;
							//First element processed; remove
							bufArr.splice(0, 1);
						}
						//await new Promise(function(res, rej) {
						//	readStream.once("end", function(data) {
						//		readStream.hasEnded = true;
						//		res(data);
						//	});
						//});
					} else {
						userSocket.emit("quizResults", JSON.stringify({
							points: quizSession.quizPoints,
							grade: resultantGrade,
							gradeComment,
								If user did not wish to share the points, the value will be zero.
						}));
					}
				} catch (e) {
					//Something went wrong, probably during streaming
					console.log(e);
				} finally {
					if (userEmail != undefined) {
						//Close the
						readStream.close();
						//Delete the file
						await new Promise(function(res, rej) {
							fs.unlink(quizSession.answersLogFileDir, function(err) {
								if (err) {
									rej(err);
								} else {
									res();
								}
							});
						});
					}
				}*/
			}
		} else {
			//Quiz not yet complete (error)
			await saveProgress(quizSession);
		}
		//Whether the quiz has successfully been taken or an error has caused its interruption, the stream must be destroyed, assuming it has not been previously destroyed, namely in the case of successful quiz completion.
		if (!answersFileWriteStream.destroyed) {
			answersFileWriteStream.destroy();
		}
	}

	//POINT
});

//Next question to be obtained through socket.io

io.on("connection", function(socket) {
	//Array to store all streams (to files) used by the socket
	//This is to remove all streams used only by the socket in case the channel closes unexpectedly during an operation (e.g.: streaming quiz data from a quiz file)
	socket.allocatedStreams = [];
	connectedSocketsMap.set(socket.id, socket);
	console.log("New user connected");
	socket.on("disconnect", function() {
		connectedSocketsMap.delete(socket.id);
		//Remove all open streams on socket termination - safety mechanism
		for (var stream of socket.allocatedStreams) {
			stream.destroy();
			console.log("Successfully closed stream associated with socket " + socket.id);
		}
		console.log("User " + socket.id + " has disconnected.");
	});
});
app.use("/server_data/server_templates", express.static(__dirname + "/server_data/server_templates"));
app.use("/server_data/server_pages", express.static(__dirname + "/server_data/server_pages"));
app.use("/server_data/server_media", express.static(__dirname + "/server_data/server_media"));
app.use("/server_data/userprofilepics", express.static(__dirname + "/server_data/userprofilepics"));
app.use("/server_data/server_static_resources", express.static(__dirname + "/server_data/server_static_resources"));
server.listen(port, function() {console.log("Listening on port " + port)});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
CREATE TABLE user (
    userID INT ZEROFILL AUTO_INCREMENT PRIMARY KEY NOT NULL,
    emailAddress VARCHAR(320) NOT NULL UNIQUE,
    hashedPwd BIGINT ZEROFILL NOT NULL,
    userName VARCHAR(50) NOT NULL,
    dateOfBirth DATE NOT NULL,
    profilePic VARCHAR(32768),
    personalDescription VARCHAR(200)
);

CREATE TABLE quiz (
    quizID INT UNSIGNED ZEROFILL PRIMARY KEY AUTO_INCREMENT, /*Used to order the quizzes in the DB*/
    quizCode VARCHAR(20) UNIQUE NOT NULL,
    userID INT UNSIGNED ZEROFILL,
    quizTitle VARCHAR(255),
    backgroundMusicSrc VARCHAR(2048), /*If there should not be any background music, set this to NULL*/
    doTimeLimit TINYINT(1) DEFAULT 0,
    doAnswerBuzzers TINYINT(1) DEFAULT 0,
    correctAnswerBuzzerSrc VARCHAR(2048), /*If there should not be any buzzer, set this to NULL*/
    incorrectAnswerBuzzerSrc VARCHAR(2048), /*If there should not be any buzzer, set this to NULL*/
    showGrade TINYINT(1) DEFAULT 0,
    showGradeComment TINYINT(1) DEFAULT 0,
    resultHTMLCommentRangesJSON VARCHAR(3000) /*Ideally, this would be an empty array if field 'showGradeComment' (or 'showGrade') were 0, but any other value would be accepted, for it would not be taken into consideration under such circumstances*/,
    sendAnswers TINYINT(1) DEFAULT 0,
    answersRecipient VARCHAR(320),
    showCorrectAnswers TINYINT(1) DEFAULT 0,
    showPoints TINYINT(1) DEFAULT 0,
    ageRestriction SMALLINT(4) UNSIGNED DEFAULT 0,
    privateQuiz TINYINT(1) DEFAULT 0,
    allowedParticipantsListJSON VARCHAR(32768) NOT NULL, /*Ideally, this would be an empty array if field 'privateQuiz' were 0, but any value would be accepted, for it would not be taken into consideration under such circumstances*/
    numQuestions INT UNSIGNED NOT NULL DEFAULT 0,
    dateCreated DATETIME NOT NULL,
    FOREIGN KEY(userID) REFERENCES user(userID) /*Map quizzes to a creator*/
);

CREATE TABLE question (
    quizCode VARCHAR(20) NOT NULL,
    questionNumber INT NOT NULL, /*To allow ordered sets of questions. NOT AUTO_INCREMENT, for the question order must be specified through this key. This key's value can occur multiple times */
    questionHTMLSanitised VARCHAR(2048),
    questionType VARCHAR(11), /*INEFFICIENT - turn it into TINYINT(N) UNSIGNED for 256 theoretically possible types within a single byte!*/
    optionsJSON VARCHAR(65535), /*Alternative - Create 'option' table*/
    correctOptionsJSON VARCHAR(65535),
    caseSensitive TINYINT(1) NOT NULL DEFAULT 1,
    correctAnswerMessageHTMLSanitised VARCHAR(2048),
    incorrectAnswerMessageHTMLSanitised VARCHAR(2048),
    timeLimit BIGINT,
    messageDuration BIGINT,
    maxpoints INT,
    FOREIGN KEY(quizCode) REFERENCES quiz(quizCode) ON UPDATE CASCADE ON DELETE CASCADE,
    PRIMARY KEY(quizCode, questionNumber)
);

CREATE TABLE notification (
    notificationNumber INT(20) ZEROFILL NOT NULL,
    senderEmail VARCHAR(320) NOT NULL,
    /*No need for recipient attribute; that can be obtained from the 'userID' foreign key*/
    userID INT UNSIGNED ZEROFILL NOT NULL,
    creationDate DATETIME NOT NULL,
    notificationTitle VARCHAR(128),
    notificationBody VARCHAR(2048),
    hasBeenSeen TINYINT(1) DEFAULT 0,
    FOREIGN KEY(userID) REFERENCES user(userID),
    PRIMARY KEY(notificationNumber, userID)
);

CREATE TABLE quizsession (
    quizCode VARCHAR(20) NOT NULL,
    emailAddress VARCHAR(320) NOT NULL,
    questionIndex INT UNSIGNED NOT NULL,
    questionsOrderJSON VARCHAR(2048) NOT NULL,
    tempAnswersLogFileDir VARCHAR(500) NOT NULL,
    quizPoints INT NOT NULL DEFAULT 0,
    numCorrectAnswers INT NOT NULL DEFAULT 0,
    FOREIGN KEY(quizCode) REFERENCES quiz(quizCode) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY(emailAddress) REFERENCES user(emailAddress) ON DELETE CASCADE,
    PRIMARY KEY(quizCode, emailAddress)
)

/*The cascades are vital - DO NOT remove them. Doing so would cause countless problems with the server when modifying and deleting users and quizzes*/

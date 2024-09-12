function loadModalStyleSheets() {
	let modalStyleSheetsLink = document.createElement("link");
	modalStyleSheetsLink.rel = "stylesheet";
	modalStyleSheetsLink.href = "/server_data/server_pages/modal/modal.css";
	document.head.appendChild(modalStyleSheetsLink);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", function(e) {
		//Import modal CSS style sheets
		loadModalStyleSheets();
	}, {once:true});
} else {
	loadModalStyleSheets();
}

class modal extends EventTarget {
	#topclicked;
	#sideclicked;
	#movingdiv;
	#initclickpos;
	#childmodals;
	#destroyChildrenOnClose;
	#parentModal;
	#closeAttemptFunctionReference;
	#signalUnDestroyable;
	#windowStats = {width:0, height:0, top:0, left:0, fullScreen:false};
	#windowManagement;
	static modalvisibilitychangeduration = 200;
	constructor(parentElem = document.body, Title = "Window", width = 250, height = 150, top = 100, left = 100, resizable = true, parentModal, destroyChildrenOnClose = false, fullscreen = false) {
		super();
		this.#windowStats.top = top;
		this.#windowStats.left = left;
		this.#windowStats.width = width;
		this.#windowStats.height = height;
		if (parentModal instanceof modal) {
			parentModal.#childmodals.push(this);
		}
		this.#parentModal = parentModal;
		this.#destroyChildrenOnClose = destroyChildrenOnClose;
		this.#childmodals = [];
		this.destroy = async function() {
			if (this.#childmodals.length === 0) {
				var animation = modaldiv.animate([
					// keyframes
					{opacity:1, scale: 1},
					{opacity:0, scale: 0}
				], {
					// timing options
					duration: modal.modalvisibilitychangeduration,
					iterations: 1
				});
				await animation.finished;
				modaldiv.remove();
				//Just in case the method was called while the window was being moved
				if (this.#movingdiv != null) {
					this.#movingdiv.remove();
					this.#movingdiv = null;
				}
				if (this.#parentModal instanceof modal) {
					this.#parentModal.#childmodals.splice(parentModal.#childmodals.indexOf(this), 1);
				}
				this.dispatchEvent(new Event("destroy"));
			} else {
				if (this.#destroyChildrenOnClose) {
					for (var childModal of this.#childmodals) {
						childModal.destroy();
					}
					var animation = modaldiv.animate([
						// keyframes
						{opacity:1},
						{opacity:0}
					], {
						// timing options
						duration: modal.modalvisibilitychangeduration,
						iterations: 1
					});
					await animation.ready;
					modaldiv.remove();
					parentModal.#childmodals.splice(parentModal.#childmodals.indexOf(this), 1);
					this.dispatchEvent(new Event("destroy"));
				} else {
					await this.#signalUnDestroyable();
				}
			}
		}
		this.#closeAttemptFunctionReference = this.destroy;
		this.#signalUnDestroyable = function() {
			var parr = [];
			for (var modal of this.#childmodals) {
				parr.push(modal.#signalUnDestroyable());
				parr.push(modal.modalElem.animate([
					{opacity:1},
					{opacity:0},
					{opacity:1},
				], {
					duration:50,
					iterations:10
				}).ready);
			}
			return Promise.all(parr);
		}
		this.#topclicked = false;
		var modaldiv = document.createElement("div");
		//Manipulating this property is much more efficient than top and left, for they, unline translate trigger a reflow on change
		modaldiv.classList.add("modaldiv");
		modaldiv.style.translate = left + "px " + top + "px";
		modaldiv.style.width = width + "px";
		modaldiv.style.height = height + "px";
		modaldiv.style.display = "none";

		this.#windowManagement = {
			enterFullScreen: (function() {
				this.#windowStats.fullScreen = true;
				modaldiv.style.translate = "0px 0px";
				modaldiv.style.width = "100%";
				modaldiv.style.height = "100%";
				modaldiv.classList.add("fullscreen");
				modalfsbtn.onclick = this.#windowManagement.exitFullScreen;
			}).bind(this),
			exitFullScreen: (function() {
				this.#windowStats.fullScreen = false;
				modaldiv.classList.remove("fullscreen");
				modaldiv.style.translate = this.#windowStats.left + "px " + this.#windowStats.top + "px";
				modaldiv.style.width = this.#windowStats.width + "px";
				modaldiv.style.height = this.#windowStats.height + "px";
				modalfsbtn.onclick = this.#windowManagement.enterFullScreen;
			}).bind(this)
		}

		var modaltopdiv = document.createElement("div");
		modaltopdiv.classList.add("modaltopdiv");

		modaltopdiv.addEventListener("pointerdown", (function(e) {
			if (e.target !== modalclosebtn && !this.#topclicked && !this.#windowStats.fullScreen) {
				//Prevent scrolling instead of window dragging for phones
				//TODO: Also destroy the touch-action property whenever the pointer leaves the document
				modaldiv.classList.add("nopanonphone");
				this.#topclicked = true;
				//Prevent element selection whilst dragging
				document.documentElement.classList.add("noselect");
				//DUE TO BORDER. Add 1 because the element's width/height start at the border. This does not apply to the event offsetX/offsetY properties.
				this.#initclickpos = [e.offsetX + 1, e.offsetY + 1];
				this.#movingdiv = document.createElement("div");
				this.#movingdiv.classList.add("movingdiv");

				//This function repositions the div according to the cursor position
				let repositionHandler = (function(e) {
					try {
						//Maintain the window's absolute position
						this.#windowStats.top = (e.pageY - this.#initclickpos[1]);
						this.#windowStats.left = (e.pageX - this.#initclickpos[0]);
						//This is due to its parent's fixed positioning relative to the viewport
						modaldiv.style.translate = (e.clientX - this.#initclickpos[0]) + "px " + (e.clientY - this.#initclickpos[1]) + "px";
					} catch (e) {
						console.log("Error whilst moving modal!");
						this.#movingdiv.remove();
						this.#movingdiv = null;
					}
				}).bind(this);
				let pointerCoords = {x:e.clientX, y:e.clientY};
				let invokeFunction = true;
				//TODO: Fix the egregious performance implications posed by the constant reflows while scrolling triggered by constant invocation of the getter functions in window.scrollX and window.scrollY 
				let scrollHandler = function() {
					//Throttling, to reduce the number of invocations to this function and therefore reflows
					if (invokeFunction) {
						invokeFunction = false;
						requestAnimationFrame(function() {
							repositionHandler({
								pageX: window.scrollX + pointerCoords.x,
								pageY: window.scrollY + pointerCoords.y,
								clientX: pointerCoords.x,
								clientY: pointerCoords.y
							});
							invokeFunction = true;
						});
					}
				}
				let pointerCoordsUpdater = function(e) {
					pointerCoords.x = e.clientX;
					pointerCoords.y = e.clientY;
				}

				//Trigger repositioning with current pointerdown event, to prevent the modal from disappearing due to it being positioned absolutely and appended to a parent whose position is fixed (relative to the viewport)
				
				repositionHandler({
					pageX: window.scrollX + e.clientX,
					pageY: window.scrollY + e.clientY,
					clientX: e.clientX,
					clientY: e.clientY
				});

				//Listen for window-wide mouse movements and update an object containing the latest mouse coordinates
				window.addEventListener("pointermove", pointerCoordsUpdater);
				this.#movingdiv.addEventListener("pointermove", repositionHandler);
				window.addEventListener("scroll", scrollHandler, {passive:true});
				let removeBackScreen = (function() {
					modaldiv.classList.remove("nopanonphone")
					//Set its real position here, when it is to be removed from its fixed-position parent
					modaldiv.style.translate = this.#windowStats.left + "px " + this.#windowStats.top + "px";
					//Remove event listeners since we are ready with them; we no longer need them wasting CPU clock cycles
					window.removeEventListener("pointermove", pointerCoordsUpdater);
					window.removeEventListener("scroll", scrollHandler);
					this.#movingdiv.removeEventListener("pointermove", repositionHandler);
					this.#movingdiv.removeEventListener("pointerup", removeBackScreen);

					this.#topclicked = false;
					//Allow selection of elements
					document.documentElement.classList.remove("noselect");
					parentElem.appendChild(modaldiv);
					this.#movingdiv.remove();
					this.#movingdiv = null;
				}).bind(this);
				this.#movingdiv.addEventListener("pointerup", removeBackScreen);

				this.#movingdiv.appendChild(modaldiv);
				document.body.appendChild(this.#movingdiv);
			} else if (this.#topclicked) {
				//User is selecting after the last mouse lift event has not been specified. No need to do anything here, since the previous values should persist
			}
		}).bind(this));
		modaldiv.appendChild(modaltopdiv);

		var modalclosebtn = document.createElement("span");
		modalclosebtn.classList.add("modalclosebtn");
		modalclosebtn.innerHTML = "&times;";
		modalclosebtn.onpointerover = (function() {
			this.style.color = "rgba(255, 255, 255, 255)";
			this.style.backgroundColor = "rgba(255, 0, 0, 255)";
		}).bind(modalclosebtn);
		modalclosebtn.onpointerout = (function() {
			this.style.color = "rgba(0, 0, 0, 255)";
			this.style.backgroundColor = "rgba(0, 0, 0, 0)";
		}).bind(modalclosebtn);
		modalclosebtn.addEventListener("click", (function() {
			this.#closeAttemptFunctionReference();
		}).bind(this));
		modaltopdiv.appendChild(modalclosebtn);

		var modalfsbtn = document.createElement("span");
		modalfsbtn.classList.add("modalfsbtn");
		modalfsbtn.onpointerover = (function() {
			this.style.color = "rgba(255, 0, 0, 255)";
			this.style.backgroundColor = "rgba(125, 204, 250, 1)";
		}).bind(modalfsbtn);
		modalfsbtn.onpointerout = (function() {
			this.style.color = "rgba(0, 0, 0, 255)";
			this.style.backgroundColor = "rgba(0, 0, 0, 0)";
		}).bind(modalfsbtn);
		var stopperHandler = function(e) {
			e.stopPropagation();
		}
		modalfsbtn.addEventListener("pointerdown", stopperHandler);
		modalfsbtn.addEventListener("pointerup", stopperHandler);
		modalfsbtn.onclick = this.#windowManagement.enterFullScreen;
		modalfsbtn.innerHTML = "&#x26F6;";
		modaltopdiv.appendChild(modalfsbtn);

		var modalbodydiv = document.createElement("div");
		modalbodydiv.classList.add("modalbody");
		modaldiv.addEventListener("pointerdown", (function(e) {
			//Only do this if the user clicked on the modal div itself
			if (resizable && e.target === modaldiv) {
				let initialWindowPos = {
					x: this.#windowStats.left - window.scrollX,
					y: this.#windowStats.top - window.scrollY,
				}
				//TODO: Verify the accuracy of the below lines of code
				//This is due to the transition from absolute positioning to fixed positioning, which causes problems with scrolling
				//Also note that translate is relative to the TOP-LEFT corner of the HTMLElement (unless otherwise specified by the transformation origin)
console.log(e.clientX, e.clientY, this.#windowStats)
				//Do not forget to deduct 1 from both the X and Y values due to the border
				modaldiv.style.translate = `${e.clientX - e.offsetX - 1}px ${e.clientY - e.offsetY - 1}px`;
				this.#sideclicked = true;
				document.documentElement.classList.add("noselect");
				this.#initclickpos = [
					parseFloat(modaldiv.style.width.replace("px", "")),
					parseFloat(modaldiv.style.height.replace("px", ""))
				];
				this.#movingdiv = document.createElement("div");
				this.#movingdiv.classList.add("movingdiv");
				//Handle scroll events and update the window's position accordingly
				//TODO: Mitigate the reflows caused by querying scroll values, perhaps by caching them
				let windowScrollHandler = (function() {
					//Decrement by 1; do not forget the border
					this.#windowStats.left = (e.clientX - e.offsetX - 1) + window.scrollX;
					this.#windowStats.top = (e.clientY - e.offsetY - 1) + window.scrollY;
				}).bind(this);
				window.addEventListener("scroll", windowScrollHandler);
				let movingDivPointerMoveHandler = (function(event) {
					//Only allow window resizing if the window is not in fullscreen mode
					if (!this.#windowStats.fullScreen) {
						if (e.offsetX >= this.#initclickpos[0] - 5) {
							this.#windowStats.width = Math.max(50, (event.clientX - initialWindowPos.x));
							modaldiv.style.width = this.#windowStats.width + "px";
						}
						if (e.offsetY >= this.#initclickpos[1] - 5) {
							this.#windowStats.height = Math.max(20, (event.clientY - initialWindowPos.y));
							modaldiv.style.height = this.#windowStats.height + "px";
						}
					}
				}).bind(this);
				this.#movingdiv.addEventListener("pointermove", movingDivPointerMoveHandler);
				//TODO: On pointer up, remove this event listener and that for pointermove
				this.#movingdiv.onpointerup = (function(event) {
					//VERY IMPORTANT: remove the scroll listener to prevent listener leaks which would deteriorate performance significantly due to the heavy operations each one performs (triggering reflows/layout thrashing)
					window.removeEventListener("scroll", windowScrollHandler);

					//Window resizing complete; revert to absolute positioning. 'Private' variable #windowStats's top and left members are always absolute (i.e.: relative to the page, not the viewport)
					modaldiv.style.translate = `${this.#windowStats.left}px ${this.#windowStats.top}px`;
					this.#sideclicked = false;
					document.documentElement.classList.remove("noselect");
					parentElem.appendChild(modaldiv);
					this.#movingdiv.remove();
					this.#movingdiv = null;
				}).bind(this);
				this.#movingdiv.appendChild(modaldiv);
				document.body.appendChild(this.#movingdiv);
			}
		}).bind(this));
		modalbodydiv.addEventListener("pointerup", (function() {
			this.#sideclicked = false;
			document.documentElement.classList.remove("noselect");
		}).bind(this));
		modaldiv.appendChild(modalbodydiv);

		var modaltitle = document.createElement("span");
		modaltitle.innerHTML = Title;
		modaltitle.classList.add("modaltitle")
		modaltopdiv.appendChild(modaltitle);

		parentElem.appendChild(modaldiv);

		this.modalElem = modaldiv;
		this.modal = modalbodydiv;
		this.show = async function() {
			modaldiv.style.display = "";
			var animationobj = modaldiv.animate([
				//keyframes
				{opacity:0, scale: 0},
				{opacity:1, scale: 1}
			], {
				// timing options
				duration: modal.modalvisibilitychangeduration,
				iterations: 1
			});
			await animationobj.ready;
			this.dispatchEvent(new Event("show"));
		}
		this.hide = async function() {
			var animationobj = modaldiv.animate([
				// keyframes
				{opacity:1, scale: 1},
				{opacity:0, scale: 0}
			], {
				// timing options
				duration: modal.modalvisibilitychangeduration,
				iterations: 1
			});
			await animationobj.ready;
			modaldiv.style.display = "none";
			this.dispatchEvent(new Event("hide"));
		}
		this.setModalTop = function(newTop) {
			this.#windowStats.top = newTop;
			modaldiv.style.translate = this.#windowStats.left + "px " + newTop + "px";			
		}
		this.setModalLeft = function(newLeft) {
			this.#windowStats.left = newLeft;
			modaldiv.style.translate = newLeft + "px " + this.#windowStats.top + "px";
		}
		this.setModalWidth = function(newWidth) {
			this.#windowStats.width = newWidth;
			modaldiv.style.width = newWidth + "px";
		}
		this.setModalHeight = function(newHeight) {
			this.#windowStats.height = newHeight;
			modaldiv.style.height = newHeight + "px";
		}
		this.setModalTitle = function(newTitle) {
			modaltitle.innerHTML = newTitle;
		}
		this.setCloseHandler = function(newHandler) {
			if (typeof newHandler === "function") {
				this.#closeAttemptFunctionReference = newHandler;
			} else {
				throw new Error("Close handler must be a function");
			}
		}
		this.getModalTop = function() {
			return this.#windowStats.top;
		}
		this.getModalLeft = function() {
			return this.#windowStats.left;
		}
		this.getModalWidth = function() {
			return this.#windowStats.width;
		}
		this.getModalHeight = function() {
			return this.#windowStats.height;
		}
		this.getModalTitle = function() {
			return modaltitle.innerHTML;
		}
		this.getCloseHandler = function() {
			return this.#closeAttemptFunctionReference;
		}
		this.getModalBody = function() {
			return modalbodydiv;
		}
	}
}

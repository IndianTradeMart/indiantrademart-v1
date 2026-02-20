// NOTE:
// This script is injected inline by a Vite dev plugin.
// Relative imports inside inline module scripts resolve relative to the current page URL.
// So on routes like /auth/forgot-password it would try to load:
//   /auth/plugins/visual-editor/visual-editor-config.js (404)
// Using an absolute path fixes that.
import { POPUP_STYLES } from "/plugins/visual-editor/visual-editor-config.js";

const PLUGIN_APPLY_EDIT_API_URL = "/api/apply-edit";

const ALLOWED_PARENT_ORIGINS = [
	"https://horizons.hostinger.com",
	"https://horizons.hostinger.dev",
	"https://horizons-frontend-local.hostinger.dev",
	"http://localhost:4000",
];

let disabledTooltipElement = null;
let currentDisabledHoverElement = null;

let translations = {
	disabledTooltipText: "This text can be changed only through chat.",
	disabledTooltipTextImage: "This image can only be changed through chat.",
};

let areStylesInjected = false;

let globalEventHandlers = null;

let currentEditingInfo = null;

function injectPopupStyles() {
	if (areStylesInjected) return;

	const styleElement = document.createElement("style");
	styleElement.id = "inline-editor-styles";
	styleElement.textContent = POPUP_STYLES;
	document.head.appendChild(styleElement);
	areStylesInjected = true;
}

function findEditableElementAtPoint(event) {
	let editableElement = event.target.closest("[data-edit-id]");

	if (editableElement) {
		return editableElement;
	}

	const elementsAtPoint = document.elementsFromPoint(
		event.clientX,
		event.clientY
	);

	const found = elementsAtPoint.find(
		(el) => el !== event.target && el.hasAttribute("data-edit-id")
	);
	if (found) return found;

	return null;
}

function findDisabledElementAtPoint(event) {
	const direct = event.target.closest("[data-edit-disabled]");
	if (direct) return direct;
	const elementsAtPoint = document.elementsFromPoint(
		event.clientX,
		event.clientY
	);
	const found = elementsAtPoint.find(
		(el) => el !== event.target && el.hasAttribute("data-edit-disabled")
	);
	if (found) return found;
	return null;
}

function showPopup(targetElement, editId, currentContent, isImage = false) {
	currentEditingInfo = { editId, targetElement };

	const parentOrigin = getParentOrigin();

	if (parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
		const eventType = isImage ? "imageEditEnter" : "editEnter";

		window.parent.postMessage(
			{
				type: eventType,
				payload: { currentText: currentContent },
			},
			parentOrigin
		);
	}
}

function handleGlobalEvent(event) {
	if (
		!document.getElementById("root")?.getAttribute("data-edit-mode-enabled")
	) {
		return;
	}

	// Don't handle if selection mode is active
	if (document.getElementById("root")?.getAttribute("data-selection-mode-enabled") === "true") {
		return;
	}

	if (event.target.closest("#inline-editor-popup")) {
		return;
	}

	const editableElement = findEditableElementAtPoint(event);

	if (editableElement) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		if (event.type === "click") {
			const editId = editableElement.getAttribute("data-edit-id");
			if (!editId) {
				console.warn("[INLINE EDITOR] Clicked element missing data-edit-id");
				return;
			}

			const isImage = editableElement.tagName.toLowerCase() === "img";
			let currentContent = "";

			if (isImage) {
				currentContent = editableElement.getAttribute("src") || "";
			} else {
				currentContent = editableElement.textContent || "";
			}

			showPopup(editableElement, editId, currentContent, isImage);
		}
	} else {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}
}

function getParentOrigin() {
	if (
		window.location.ancestorOrigins &&
		window.location.ancestorOrigins.length > 0
	) {
		return window.location.ancestorOrigins[0];
	}

	if (document.referrer) {
		try {
			return new URL(document.referrer).origin;
		} catch (e) {
			console.warn("Invalid referrer URL:", document.referrer);
		}
	}

	return null;
}

async function handleEditSave(updatedText) {
	const newText = updatedText
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/{/g, "&#123;")
		.replace(/}/g, "&#125;");

	const { editId } = currentEditingInfo;

	try {
		const response = await fetch(PLUGIN_APPLY_EDIT_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				editId: editId,
				newFullText: newText,
			}),
		});

		const result = await response.json();
		if (result.success) {
			const parentOrigin = getParentOrigin();
			if (parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
				window.parent.postMessage(
					{
						type: "editApplied",
						payload: {
							editId: editId,
							fileContent: result.newFileContent,
							beforeCode: result.beforeCode,
							afterCode: result.afterCode,
						},
					},
					parentOrigin
				);
			} else {
				console.error("Unauthorized parent origin:", parentOrigin);
			}
		} else {
			console.error(
				`[vite][visual-editor] Error saving changes: ${result.error}`
			);
		}
	} catch (error) {
		console.error(
			`[vite][visual-editor] Error during fetch for ${editId}:`,
			error
		);
	}
}

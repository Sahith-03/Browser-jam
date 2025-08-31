function getCssPath(el) {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector) nth++;
            }
            if (nth != 1) selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

function serializeV2() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    if (range.collapsed) return null;

    const highlightId = `jam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const highlights = [];
    const iterator = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let currentNode;

    while (currentNode = iterator.nextNode()) {
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(currentNode);

        // Check if the current text node is part of the selection
        // We do this by checking if the ranges intersect
        if (range.intersectsNode(currentNode)) {
            
            // --- THE FIX IS HERE ---
            // We create a new range representing the intersection of the user's selection
            // and the current text node.
            const intersectionRange = document.createRange();

            // The start of the intersection is the later of the two starts
            intersectionRange.setStart(
                range.startContainer === currentNode ? range.startContainer : currentNode,
                range.startContainer === currentNode ? range.startOffset : 0
            );

            // The end of the intersection is the earlier of the two ends
            intersectionRange.setEnd(
                range.endContainer === currentNode ? range.endContainer : currentNode,
                range.endContainer === currentNode ? range.endOffset : currentNode.length
            );
            // --- END OF FIX ---


            const serialized = {
                text: intersectionRange.toString(),
                path: getCssPath(currentNode.parentElement),
                nodeIndex: Array.from(currentNode.parentElement.childNodes).indexOf(currentNode),
                startOffset: intersectionRange.startOffset,
                endOffset: intersectionRange.endOffset,
                highlightId: highlightId
            };
            
            // Only add the highlight part if it actually contains text
            if (serialized.text.trim() !== '') {
                highlights.push(serialized);
            }
        }
    }
    return highlights;
}

function deserializeV2(highlightParts) {
    if (!highlightParts || highlightParts.length === 0) return;
    
    const highlightId = highlightParts[0].highlightId;

    for (const part of highlightParts) {
        try {
            const parent = document.querySelector(part.path);
            if (!parent) continue;
            
            const node = parent.childNodes[part.nodeIndex];
            if (!node || node.nodeType !== Node.TEXT_NODE) continue;

            const range = document.createRange();
            range.setStart(node, part.startOffset);
            range.setEnd(node, part.endOffset);

            const span = document.createElement('span');
            span.className = `browser-jam-highlight ${highlightId}`;
            span.dataset.highlightId = highlightId; // <-- THE IMPORTANT ADDITION
            span.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
            span.style.cursor = 'pointer';
            
            range.surroundContents(span);

        } catch (e) {
            console.error("Error applying highlight part:", e, part);
        }
    }
    window.getSelection().removeAllRanges();
}
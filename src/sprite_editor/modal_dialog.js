class ModalDialog {
    constructor() {
        this._overlay = null;
        this._resolve = null;
    }

    show(config) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._overlay = document.createElement("div");
            this._overlay.className = "se-modal-overlay";

            const dialog = document.createElement("div");
            dialog.className = "se-modal-dialog";

            dialog.appendChild(this._buildTitle(config));
            const fields = this._buildBody(config, dialog);
            this._buildActions(config, fields, dialog);

            this._overlay.appendChild(dialog);
            document.body.appendChild(this._overlay);

            const firstInput = Object.values(fields)[0];
            if (firstInput) {
                firstInput.focus();
                if (firstInput.select) firstInput.select();
            }
        });
    }

    _buildTitle(config) {
        const title = document.createElement("div");
        title.className = "se-modal-title";
        title.textContent = config.title || "Dialog";
        return title;
    }

    _buildBody(config, dialog) {
        const body = document.createElement("div");
        body.className = "se-modal-body";
        const fields = {};

        if (config.fields) {
            config.fields.forEach(field => {
                const row = document.createElement("div");
                row.className = "se-modal-field";

                const label = document.createElement("label");
                label.className = "se-modal-label";
                label.textContent = field.label;
                row.appendChild(label);

                const input = this._createFieldInput(field);
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") { e.preventDefault(); this._submit(config.fields, fields); }
                    if (e.key === "Escape") { this._cancel(); }
                    e.stopPropagation();
                });

                fields[field.key] = input;
                row.appendChild(input);
                body.appendChild(row);
            });
        }

        dialog.appendChild(body);
        return fields;
    }

    _createFieldInput(field) {
        if (field.type === "select") {
            const select = document.createElement("select");
            select.className = "se-modal-select";
            field.options.forEach(opt => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                if (opt.value === field.value) option.selected = true;
                select.appendChild(option);
            });
            return select;
        }

        const input = document.createElement("input");
        input.className = "se-modal-input";
        input.type = field.type || "text";
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        input.value = field.value !== undefined ? field.value : "";
        return input;
    }

    _buildActions(config, fields, dialog) {
        const actions = document.createElement("div");
        actions.className = "se-modal-actions";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "se-modal-btn se-modal-btn-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => this._cancel());
        actions.appendChild(cancelBtn);

        const okBtn = document.createElement("button");
        okBtn.className = "se-modal-btn se-modal-btn-ok";
        okBtn.textContent = config.okText || "OK";
        okBtn.addEventListener("click", () => this._submit(config.fields, fields));
        actions.appendChild(okBtn);

        dialog.appendChild(actions);
    }

    _submit(fieldConfigs, fieldElements) {
        const result = {};
        fieldConfigs.forEach(field => {
            const el = fieldElements[field.key];
            if (field.type === "number") {
                result[field.key] = parseInt(el.value) || 0;
            } else if (field.type === "select") {
                result[field.key] = el.value;
            } else {
                result[field.key] = el.value;
            }
        });
        this._close();
        this._resolve(result);
    }

    _cancel() {
        this._close();
        this._resolve(null);
    }

    _close() {
        if (this._overlay && this._overlay.parentElement) {
            this._overlay.remove();
        }
        this._overlay = null;
    }
}

export { ModalDialog };

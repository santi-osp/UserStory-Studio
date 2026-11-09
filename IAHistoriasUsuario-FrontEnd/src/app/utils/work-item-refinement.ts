import DOMPurify from 'dompurify';
import {
  RefinableWorkItemField,
  WorkItemFields,
  WorkItemRefinementContent,
} from '../models/types';
import {
  normalizeWorkItemContentHtml,
  workItemContentHtmlToText,
} from './work-item-content-html';

export const REFINEMENT_FIELD_LABELS: Record<RefinableWorkItemField, string> = {
  title: 'Título',
  description: 'Descripción',
  acceptanceCriteria: 'Criterios de aceptación',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sanitizeContentField(
  field: RefinableWorkItemField,
  value: string,
): string {
  if (field === 'title') {
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim();
  }

  return normalizeWorkItemContentHtml(value);
}

function explicitlyAllowsEmpty(
  instructions: string,
  field: RefinableWorkItemField,
): boolean {
  const normalized = normalizeText(instructions);
  const fieldPattern =
    field === 'title'
      ? '(?:titulo)'
      : field === 'description'
        ? '(?:descripcion)'
        : '(?:criterios? de aceptacion|criterios?)';

  return [
    new RegExp(
      `(?:deja|establece|pon)\\s+(?:el|la|los)?\\s*${fieldPattern}\\s+(?:vacio|vacia|vacios|vacias|sin contenido)`,
    ),
    new RegExp(
      `(?:elimina|borra|quita|remueve)\\s+(?:por completo\\s+)?(?:el contenido\\s+de\\s+)?(?:el|la|los)?\\s*${fieldPattern}`,
    ),
    new RegExp(
      `${fieldPattern}\\s+(?:(?:debe|deben)\\s+(?:quedar|estar)\\s+)?(?:quede|vacio|vacia|vacios|vacias|sin contenido)`,
    ),
  ].some((pattern) => pattern.test(normalized));
}

export function isMeaningfulRefinementContent(value: string): boolean {
  return workItemContentHtmlToText(value).length > 0;
}

export function pickWorkItemRefinementContent(
  workItem: WorkItemFields,
  fields: readonly RefinableWorkItemField[],
): WorkItemRefinementContent {
  const content: WorkItemRefinementContent = {};
  fields.forEach((field) => {
    content[field] = String(workItem[field] ?? '');
  });
  return content;
}

export function hasSufficientRefinementBase(
  content: WorkItemRefinementContent,
  selectedFields: readonly RefinableWorkItemField[],
): boolean {
  return (
    selectedFields.length > 0 &&
    selectedFields.some((field) =>
      isMeaningfulRefinementContent(content[field] ?? ''),
    )
  );
}

export function parseWorkItemRefinementResponse(
  json: string,
  baseContent: WorkItemRefinementContent,
  supportedFields: readonly RefinableWorkItemField[],
  selectedFields: readonly RefinableWorkItemField[],
  instructions: string,
): {
  content: WorkItemRefinementContent;
  changedFields: RefinableWorkItemField[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('La propuesta de refinamiento no contiene JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('La propuesta de refinamiento debe ser un objeto JSON.');
  }

  const envelope = parsed as Record<string, unknown>;
  const envelopeFields = Object.keys(envelope);
  const unexpectedEnvelopeFields = envelopeFields.filter(
    (field) => field !== 'workItem',
  );
  if (unexpectedEnvelopeFields.length > 0) {
    throw new Error(
      `La propuesta contiene secciones inesperadas: ${unexpectedEnvelopeFields.join(', ')}.`,
    );
  }
  const workItem = envelope['workItem'];
  if (!workItem || typeof workItem !== 'object' || Array.isArray(workItem)) {
    throw new Error(
      "La propuesta de refinamiento debe contener el objeto 'workItem'.",
    );
  }

  const response = workItem as Record<string, unknown>;
  const responseFields = Object.keys(response);
  const unexpectedFields = responseFields.filter(
    (field) => !supportedFields.includes(field as RefinableWorkItemField),
  );
  if (unexpectedFields.length > 0) {
    throw new Error(
      `La propuesta contiene campos inesperados: ${unexpectedFields.join(', ')}.`,
    );
  }

  const missingFields = supportedFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(response, field),
  );
  if (missingFields.length > 0) {
    throw new Error(
      `La propuesta no devolvió los campos requeridos: ${missingFields.join(', ')}.`,
    );
  }

  const selected = new Set(selectedFields);
  const content: WorkItemRefinementContent = {};
  for (const field of supportedFields) {
    const value = response[field];
    if (typeof value !== 'string') {
      throw new Error(`El campo ${field} de la propuesta debe ser texto.`);
    }

    if (!selected.has(field) && value !== String(baseContent[field] ?? '')) {
      throw new Error(
        `La propuesta modificó el campo no seleccionado ${field}.`,
      );
    }

    const sanitizedValue = sanitizeContentField(field, value);
    if (
      selected.has(field) &&
      !isMeaningfulRefinementContent(sanitizedValue) &&
      !explicitlyAllowsEmpty(instructions, field)
    ) {
      throw new Error(
        `La propuesta dejó vacío el campo seleccionado ${field} sin una indicación explícita.`,
      );
    }

    content[field] = sanitizedValue;
  }

  const changedFields = supportedFields.filter(
    (field) =>
      content[field] !==
      sanitizeContentField(field, String(baseContent[field] ?? '')),
  );

  return { content, changedFields };
}

export function mergeWorkItemRefinementContent(
  workItem: WorkItemFields,
  content: WorkItemRefinementContent,
  selectedFields: readonly RefinableWorkItemField[],
): WorkItemFields {
  const merged: WorkItemFields = { ...workItem };
  selectedFields.forEach((field) => {
    if (typeof content[field] === 'string') {
      merged[field] = content[field];
    }
  });
  return merged;
}

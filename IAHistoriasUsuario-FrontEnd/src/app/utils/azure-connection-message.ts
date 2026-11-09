export function getAzureConnectionMessage(
  organization: string,
  hasRuntimeCredential: boolean,
): string {
  const hasOrganization = !!organization.trim();
  if (!hasOrganization && !hasRuntimeCredential) {
    return 'Configura la organización y el Azure PAT para continuar.';
  }
  if (!hasOrganization) {
    return 'Configura la organización de Azure DevOps para cargar la información.';
  }
  if (!hasRuntimeCredential) {
    return 'Ingresa tu Azure PAT en Configuración Azure para actualizar la información.';
  }
  return '';
}

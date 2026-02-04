# Guia do Diretório Virtual

## Visão Geral

`.VirtualDirectory` é um diretório virtual gerado automaticamente por esta aplicação, utilizado para exibir a estrutura de arquivos após a organização inteligente. Mantém uma correspondência um-para-um com os arquivos do diretório original, mas utiliza uma nomeação inteligente.

## Objetivo

O principal objetivo deste diretório virtual é permitir que os usuários visualizem previamente os resultados da organização de arquivos sem mover ou copiar realmente os arquivos originais.
Quando estiver satisfeito com o resultado final, você pode clicar em "Organizar Diretório Real" para organizar o diretório real para corresponder à estrutura de arquivos do .VirtualDirectory, e então esta aplicação excluirá o diretório .VirtualDirectory.

## Princípios Técnicos

### Tecnologia de Links Rígidos

Os arquivos no diretório virtual são gerados utilizando tecnologia de links rígidos. Links rígidos podem ser simplesmente entendidos como referências ou aliases de arquivos, com as seguintes características:

1. Não ocupam espaço adicional no disco físico
2. Compartilham os mesmos blocos de dados com o arquivo original
3. Modificações nos arquivos com links rígidos são sincronizadas com o arquivo original
4. Excluir um arquivo com link rígido não afeta o arquivo original
5. Ao excluir o arquivo original, é necessário excluir o arquivo com link rígido (esta aplicação detectará ativamente exclusões de arquivos no diretório real e excluirá correspondentemente os arquivos com links rígidos no diretório virtual.)

### Diferença em relação aos Atalhos

Embora os links rígidos sejam semelhantes aos atalhos em certa medida, existem diferenças importantes entre eles:

| Característica | Atalhos | Links Rígidos |
|----------------|---------|---------------|
| Nível do Sistema de Arquivos | Apenas conceito do Windows | Função do sistema de arquivos do sistema operacional |
| Espaço Ocupado | Mínimo (apenas metadados) | Sem espaço adicional |
| Excluir Arquivo Original | O atalho se torna inválido | O link rígido ainda pode acessar o conteúdo do arquivo |
| Modificar Conteúdo | Não afeta o arquivo original | Sincronizado em todos os links |
| Suporte entre Volumes | Suportado | Limitado ao mesmo sistema de arquivos |
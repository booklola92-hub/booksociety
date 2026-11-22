# Ampliar o catálogo interno com metadados de fontes abertas

## Situação atual (medida agora)

| Onde | Registros |
|---|---|
| Livros cadastrados (`books`) | 12, todos do cadastro inicial (nenhum é de Nora Roberts) |
| Biblioteca de obras (`works`) | 0 |
| Novels, Mangás, Manhwas, BL | 0 |

- A Busca já consulta só o catálogo interno, e o filtro BL é transversal (uma marca na obra, sem cópia).
- A correção para achar autores e títulos sem acento ou pontuação (ex.: "Garcia Marquez", "JRR Tolkien") já está no banco. Falta um teste com uma conta conectada.
- "Nora Roberts" não aparece porque não existe nenhuma obra dela no catálogo. A busca interna não pode mostrar o que ainda não foi cadastrado. Com a importação da Open Library (passo 2), as obras dela passam a existir.

## Revisão do banco atual

- **Livros cadastrados (`books`)**:
  - têm título, um único campo de autor (texto), capa (endereço de imagem ou arquivo enviado), descrição, páginas e quem cadastrou;
  - não têm formato, idioma, código externo (ISBN) nem marca BL.
  
  Ficam como estão.
- **Biblioteca de obras (`works`)**:
  - já tem título, título original, títulos alternativos, lista de autores, sinopse, gêneros, tags, formato (livro, novel, webnovel, mangá, manhwa, manhua, outro), marca BL, situação, ano, capítulos, volumes, capa e "informações limitadas";
  - já tem colunas de busca normalizada com índice.
  
  Faltam idioma, licença e ligação com `books`.
- **Fontes de cada obra (`work_sources`)**:
  - guardam fonte + código externo (único) + endereço de origem;
  - faltam licença, crédito e os códigos cruzados entre fontes.
- **`search_catalog`**:
  - junta livros e obras, com filtro por categoria e BL transversal, só para leitores conectados, sem cadastrar nada;
  - hoje normaliza cada linha na hora da busca. Funciona com poucos registros, mas fica lenta com milhões. Por isso passará a usar as colunas normalizadas e os índices.
- Só o servidor grava obras. As leitoras não acessam as tabelas diretamente, apenas as funções de busca e de detalhe.

## Fontes legítimas e o que cada uma permite

| Fonte | Cobre | Licença / regra | Usar? |
|---|---|---|---|
| Open Library (arquivos mensais completos) | Livros, alguns light novels | Domínio público (CC0); dados para download em massa | Sim, fonte principal de Livros |
| Wikidata | Livros, mangás, manhwas, light novels, títulos originais em vários idiomas, gênero BL/yaoi | Domínio público (CC0) | Sim, para títulos originais/alternativos e ligações entre fontes |
| MangaDex (API) | Mangá, manhwa, manhua, com tag "Boys' Love" | Livre se o site **não tiver anúncios nem cobrança** e der crédito; proíbe exibir capas direto dos servidores deles | Sim, com crédito e **sem capas** |
| MangaUpdates (API) | Mangá, manhwa, manhua e novels, gêneros Shounen Ai / Yaoi | Exige crédito e consultas espaçadas | Sim, com crédito e ritmo lento |
| AniList | Mangá e novels | Os termos **proíbem coleta em massa** | Não usar para importar |
| Google Books, Goodreads, Novel Updates, sites de leitura | — | Sem download em massa ou sem API | Não usar |

Contagens reais do MangaDex medidas agora (só obras sem conteúdo adulto explícito):
- 86.408 títulos no total, sendo 68.801 japoneses (mangá), 7.524 coreanos (manhwa) e 5.972 chineses (manhua);
- 7.664 obras BL (16.017 contando as de conteúdo adulto).

## Cobertura estimada

- **Livros**: a Open Library tem dezenas de milhões de obras, e tudo não cabe nem é útil. Proposta: começar com obras que tenham autor, edição em português, inglês ou espanhol e capa, o que dá na casa de 1 milhão. A quantidade exata será medida antes de gravar.
- **Mangás e Manhwas**: de 80 a 90 mil títulos (MangaDex), mais o que só existir no MangaUpdates.
- **BL**: cerca de 7,7 mil títulos com classificação segura ou sugestiva só no MangaDex, mais BL do MangaUpdates (incluindo BL novels).
- **Novels e Light Novels**: é a categoria mais fraca. Não existe fonte aberta completa de webnovels (o Novel Updates não tem API). Os dados virão do MangaUpdates (tipo Novel), do Wikidata (light novels) e da Open Library.
- **Espaço no banco**: cerca de 1 a 2 GB por milhão de obras, com índices. Pode exigir um plano maior do banco. Vou mostrar o tamanho medido depois de cada etapa, antes de seguir.

## Regras da importação

- Só **metadados**:
  - título, título original e alternativos;
  - autores, idioma, formato, ano, gêneros e tags (inclusive BL);
  - capa só quando a fonte permite exibir;
  - fonte e licença de cada dado.
- Nenhum texto de livro ou capítulo. Sinopse só da Open Library (domínio público). Das outras fontes, nada de sinopse, porque esses textos têm direitos autorais.
- **Nada é apagado nem sobrescrito.** A importação só acrescenta obras novas e novas ligações "encontrada também em". Os 12 livros atuais ficam intactos.
- **Sem duplicatas**:
  - primeiro pelos códigos que as próprias fontes cruzam (MangaDex, MangaUpdates e Wikidata apontam uns para os outros; livros por ISBN e chave da Open Library);
  - depois por título normalizado + autor + formato.
  
  Uma obra que já existe entre os 12 livros não é criada de novo.
- **BL é uma marca na obra**, nunca uma cópia. A obra aparece no formato dela (Novel, Mangá ou Manhwa) e também em BL.
- Conteúdo adulto explícito fica fora, salvo se você pedir o contrário.
- A **Busca continua consultando só o catálogo interno**. Nenhuma fonte externa é chamada quando a leitora pesquisa.

## Atualização incremental

- Uma tabela de controle guarda, por fonte, o ponto onde a última sincronização parou:
  - Open Library: data do arquivo mensal;
  - MangaDex: data de atualização do último título lido;
  - MangaUpdates: id e data;
  - Wikidata: data da última revisão.
- Uma rotina agendada (ex.: semanal) busca só o que é novo ou mudou desde esse ponto, em lotes pequenos, no ritmo permitido por cada fonte, com pausa automática quando a fonte pedir para esperar.
- Obras já importadas só ganham coisas novas, como títulos alternativos ou outra fonte. Nada é apagado, e os 12 livros atuais nunca são alterados.
- Cada lote registra quantas obras entraram, quantas foram reconhecidas como duplicatas e quantas foram recusadas por falta de dados (sem título ou formato verificável).

## Etapas (cada uma espera sua aprovação para a seguinte)

1. **Preparação, sem importar nada**:
   - terminar o teste da busca por autor com uma conta conectada;
   - acrescentar ao catálogo os campos de idioma, licença e crédito da fonte, mais a ligação com os 12 livros atuais;
   - deixar a busca rápida para milhões de registros;
   - medir quantos registros cada fonte traria e quanto espaço ocuparia.
2. **Livros (Open Library)**: lote piloto de 10 mil, conferência com você, depois o restante em lotes.
3. **Mangás, Manhwas e BL (MangaDex)**: piloto de 2 mil, depois tudo, no ritmo permitido (cerca de 5 consultas por segundo).
4. **Complemento (MangaUpdates)**: novels, BL novels e títulos que faltarem, em ritmo lento.
5. **Títulos originais e alternativos (Wikidata)** para as obras já importadas.
6. **Crédito das fontes** em uma linha discreta no rodapé da página Busca, no estilo atual (exigido pelo MangaDex e pelo MangaUpdates). Opcional: atualização mensal automática do catálogo.

Confirmado: o site não tem anúncios nem cobrança, então o uso do MangaDex é permitido (com crédito). Conteúdo adulto explícito fica de fora, salvo se você pedir o contrário.

## Detalhes técnicos

- Novos campos:
  - em `works`: `languages text[]`, `original_language text` e `book_id` (aponta para um livro existente, para não duplicar);
  - em `work_sources`: `license`, `attribution` e `cross_ids jsonb`.
  
  Tudo como acréscimo, sem remover nada. `search_catalog` passa a usar as colunas normalizadas já indexadas (`search_titles`, `search_authors`, índices trigram) e esconde obras ligadas a um livro de `books`.
- Pipeline:
  - os dados abertos são baixados e filtrados fora do site (arquivos da Open Library processados em partes);
  - a gravação é só de inserção, em lotes, com `ON CONFLICT DO NOTHING` em `work_sources(source, external_id)`;
  - as obras existentes nunca recebem `UPDATE`;
  - cada lote fica registrado numa tabela de controle (fonte, quantidade, data, licença).
- Mapeamentos:
  - MangaDex: `originalLanguage` ja → mangá, ko → manhwa, zh → manhua; tag "Boys' Love" → BL;
  - MangaUpdates: tipo e gêneros Shounen Ai / Yaoi → BL;
  - Wikidata: "instância de" mangá / manhwa / light novel e gênero yaoi / boys' love.
- Testes:
  - regras de categoria e BL transversal;
  - junção de duplicatas por código cruzado e por título + autor;
  - nenhuma chamada externa durante a busca.

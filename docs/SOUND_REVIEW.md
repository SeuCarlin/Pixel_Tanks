# Revisão dos sons

Abra `http://localhost:3000/sound-review.html` com o servidor local do jogo ligado. A página mostra cinco sugestões por ocorrência. Clique em **+ BUSCAR OUTRO SOM** para pesquisar todo o catálogo ou selecionar um arquivo MP3/WAV do computador, inclusive de `D:\sons`. Você pode ouvir antes de confirmar.

Use a busca por **míssil** para revisar primeiro as trilhas de míssil, míssil guiado e microfoguetes. Em **vórtex**, compare o som de surgimento, desvio e fogo. As demais categorias incluem tiros, impactos, elementos, interface, eventos e ambiente.

Ao terminar, clique em **COPIAR ESCOLHAS** e cole o JSON na conversa. Apenas ocorrências confirmadas entram no resumo. A opção A é o som atual para ocorrências existentes; nas novas trilhas de míssil, A é uma sugestão e ainda não toca durante o voo. Arquivos locais ficam salvos somente neste navegador; o resumo inclui nome, tamanho e hash do arquivo, mas não o áudio. Ao escolher um arquivo fora do catálogo, mantenha o original para que possamos integrá-lo ao jogo.

As amostras de voo foram preparadas com `python scripts/import-flight-candidates.py D:/sons`. São WAVs mono compactos usados na revisão; a implementação do som em voo depende da escolha confirmada.

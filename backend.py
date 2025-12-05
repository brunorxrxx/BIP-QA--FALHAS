from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from io import BytesIO
import pandas as pd
import re
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extrair_data_do_nome(nome_arquivo: str):
    """
    Procura data no nome do arquivo no formato DD.MM.AAAA ou DD-MM-AAAA.
    Ex: Output_21.11.2025.xlsx
    """
    padrao = r"(\d{2})[.\-](\d{2})[.\-](\d{4})"
    m = re.search(padrao, nome_arquivo)
    if not m:
        return None
    dia, mes, ano = m.groups()
    try:
        data = datetime(int(ano), int(mes), int(dia))
        return data.date()
    except ValueError:
        return None


def tratar_falhas(df: pd.DataFrame) -> pd.DataFrame:
    # Garante colunas esperadas
    if "Estação de teste" not in df.columns:
        df["Estação de teste"] = None
    if "Descrição" not in df.columns:
        df["Descrição"] = None
    if "Descrição.1" not in df.columns:
        df["Descrição.1"] = None

    # Estação vazia -> TBA
    df["Estacao_Ajustada"] = df["Estação de teste"].fillna("")
    df.loc[df["Estacao_Ajustada"] == "", "Estacao_Ajustada"] = "TBA"

    # Descrição.1 em branco -> TBA
    df["Descrição.1"] = df["Descrição.1"].fillna("")
    df["Descrição.1"] = df["Descrição.1"].astype(str).str.strip()
    df.loc[df["Descrição.1"] == "", "Descrição.1"] = "TBA"

    # Screening Input BE (primeira coluna Descrição) para NDF / PLACA LAVADA
    def ajusta_descricao(row):
        desc1 = str(row.get("Descrição.1", "") or "").upper()
        desc_original = row.get("Descrição", "")
        if "NDF" in desc1 or "PLACA LAVADA" in desc1:
            return "Screening Input BE"
        return desc_original

    df["Descricao_Ajustada"] = df.apply(ajusta_descricao, axis=1)

    return df


def tratar_output(df: pd.DataFrame, nome_arquivo: str) -> pd.DataFrame:
    # Garante colunas
    if "Estação de teste" not in df.columns:
        df["Estação de teste"] = None
    if "Total" not in df.columns:
        df["Total"] = 0

    # Estação padronizada
    df["Estacao"] = df["Estação de teste"]

    # Board Pass = Total (como combinado)
    df["Board_Pass"] = df["Total"]

    # Data vinda do nome do arquivo
    data_arquivo = extrair_data_do_nome(nome_arquivo)
    if data_arquivo:
        df["Data"] = pd.to_datetime(data_arquivo)
    else:
        df["Data"] = pd.NaT

    return df


@app.post("/processar")
async def processar(
    falhas: UploadFile = File(...),
    output: UploadFile = File(...)
):
    # Cabeçalho na segunda linha (linha 2 do Excel)
    df_falhas = pd.read_excel(BytesIO(await falhas.read()), header=1)
    df_output = pd.read_excel(BytesIO(await output.read()), header=1)

    df_falhas = tratar_falhas(df_falhas)
    df_output = tratar_output(df_output, output.filename)

    # Seleciona colunas relevantes
    falhas_cols = [
        "Serial",
        "Linha",
        "Work Order",
        "Estacao_Ajustada",
        "Descricao_Ajustada",
        "Descrição.1",
        "Item",
    ]
    falhas_cols = [c for c in falhas_cols if c in df_falhas.columns]

    output_cols = [
        "Linha",
        "Estacao",
        "Total",
        "Board_Pass",
        "Work Order",
        "Nome do Modelo",
        "Modelo Serial",
        "Data",
    ]
    output_cols = [c for c in output_cols if c in df_output.columns]

    df_falhas_envio = df_falhas[falhas_cols].copy()
    df_output_envio = df_output[output_cols].copy()

    # Troca NaN/NaT por None (compatível com JSON)
    df_falhas_envio = df_falhas_envio.where(pd.notnull(df_falhas_envio), None)
    df_output_envio = df_output_envio.where(pd.notnull(df_output_envio), None)

    # Data como string
    if "Data" in df_output_envio.columns:
        df_output_envio["Data"] = df_output_envio["Data"].astype(str)

    return {
        "falhas_rows": df_falhas_envio.to_dict(orient="records"),
        "output_rows": df_output_envio.to_dict(orient="records"),
    }

# Rodar:
# uvicorn backend:app --reload

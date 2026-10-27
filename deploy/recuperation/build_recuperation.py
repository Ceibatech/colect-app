"""Tableau et étiquettes code-barres des premières boîtes à récupérer.
usage: python3 build.py boites.json sortie_dossier"""
import json, sys, collections, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128, qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

src, outdir = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))
APP = "https://geoarchives.ceiba-analytics.com"
GENERIC = 80

def ctn(i): return f"CTN-{i:08d}"
def tidy(t): return " ".join((t or "").split())

LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 else 200
SITE = "Site ministère - Plateau"
data["boxes"] = [b for b in data["boxes"] if b["dossiers"] and b["dossiers"][0].get("site") == SITE]
real = [b for b in data["boxes"] if len(b["dossiers"]) <= GENERIC]
generic_raw = [b for b in data["boxes"] if len(b["dossiers"]) > GENERIC and b["id"] <= (real[LIMIT - 1]["id"] if len(real) >= LIMIT else 10**9)]
boxes = []
for rank, b in enumerate(real[:LIMIT], 1):
    labels = collections.Counter(tidy(d["libelle"]) for d in b["dossiers"] if tidy(d["libelle"]))
    label = labels.most_common(1)[0][0] if labels else "Sans libellé"
    first = b["dossiers"][0] if b["dossiers"] else {}
    boxes.append(dict(rank=rank, id=b["id"], code=ctn(b["id"]), label=label, variants=[l for l, _ in labels.most_common()[1:]],
                      site=first.get("site") or "", salle=first.get("salle") or "", dossiers=b["dossiers"]))
# Nom unique : le libellé, complété par le CTN s'il apparaît plusieurs fois.
counts = collections.Counter(b["label"].lower() for b in boxes)
for b in boxes:
    b["name"] = b["label"] if counts[b["label"].lower()] == 1 else f'{b["label"]} ({b["code"]})'
    b["dossier_codes"] = [(f'{b["code"]}-{i:04d}', d) for i, d in enumerate(b["dossiers"], 1)]

total_dossiers = sum(len(b["dossiers"]) for b in boxes)
def summary(b):
    labels = collections.Counter(tidy(d["libelle"]) for d in b["dossiers"] if tidy(d["libelle"]))
    first = b["dossiers"][0]
    return dict(code=ctn(b["id"]), name=labels.most_common(1)[0][0] if labels else "Sans libellé", dossiers=len(b["dossiers"]), site=first.get("site") or "", salle=first.get("salle") or "",
                communes=", ".join(sorted({d["commune"] for d in b["dossiers"] if d["commune"]}))[:200], lotissements=", ".join(sorted({d["lotissement"] for d in b["dossiers"] if d["lotissement"]}))[:300])
big = [summary(b) for b in generic_raw]

# ---------- Excel ----------
wb = Workbook()
H = Font(name="Arial", bold=True, color="FFFFFF"); HF = PatternFill("solid", fgColor="17284D")
F = Font(name="Arial", size=10); WARN = PatternFill("solid", fgColor="FDECC8")
thin = Side(style="thin", color="D0D5DD")
def sheet(ws, headers, widths):
    ws.append(headers)
    for c, w in zip(ws[1], widths):
        c.font = H; c.fill = HF; c.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[c.column_letter].width = w
    ws.freeze_panes = "A2"; ws.row_dimensions[1].height = 32
def finish(ws):
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = F; c.border = Border(bottom=thin); c.alignment = Alignment(vertical="top", wrap_text=True)
    ws.auto_filter.ref = ws.dimensions

ws = wb.active; ws.title = "Boîtes"
sheet(ws, ["N°", "Code-barres de la boîte", "Nom unique de la boîte", "Site", "Salle", "Dossiers", "Codes-barres des dossiers", "Premier dossier", "Dernier dossier", "Autres écritures du libellé", "À vérifier"],
      [6, 20, 40, 24, 26, 10, 30, 18, 18, 36, 40])
for b in boxes:
    codes = b["dossier_codes"]
    import re
    notes = []
    if not b["salle"]: notes.append("Salle non renseignée")
    if b["label"] == "Sans libellé": notes.append("Sans libellé")
    if re.fullmatch(r"(?i)(a+\d*|q-?\d)", b["label"]): notes.append("Libellé à confirmer (saisie de test ?)")
    note = " ; ".join(notes)
    b["note"] = note
    ws.append([b["rank"], b["code"], b["name"], b["site"], b["salle"], len(b["dossiers"]),
               f"{codes[0][0]} à {codes[-1][0]}" if codes else "", codes[0][1]["reference"] if codes else "", codes[-1][1]["reference"] if codes else "",
               " | ".join(b["variants"][:5]), note])
    if note:
        for c in ws[ws.max_row]: c.fill = WARN
finish(ws)

wd = wb.create_sheet("Dossiers")
sheet(wd, ["Code-barres du dossier", "Code-barres de la boîte", "Nom de la boîte", "N° dans la boîte", "Référence dossier", "Titulaire", "Commune", "Lotissement", "Îlot", "Lot", "Titre foncier", "Ancien code-barres saisi"],
      [22, 18, 34, 10, 18, 28, 18, 26, 8, 8, 16, 18])
for b in boxes:
    for i, (code, d) in enumerate(b["dossier_codes"], 1):
        wd.append([code, b["code"], b["name"], i, d["reference"], d["titulaire"], d["commune"], d["lotissement"], d["ilot"], d["lot"], d["titreFoncier"], d["codeBarresSaisi"]])
finish(wd)

wg = wb.create_sheet("Libellés à découper")
sheet(wg, ["Code actuel", "Libellé", "Dossiers", "Site", "Salle", "Communes", "Lotissements"], [16, 36, 10, 22, 24, 30, 60])
for g in big:
    wg.append([g["code"], g["name"], g["dossiers"], g["site"], g["salle"], g["communes"], g["lotissements"]])
finish(wg)

wr = wb.create_sheet("Règles")
rules = [
    ("Boîtes retenues", f"Les {len(boxes)} premières boîtes du {SITE} dans l'ordre de l'inventaire (identifiant CTN croissant). Les sites de démonstration sont exclus."),
    ("Nom unique", "Le libellé saisi à l'inventaire, regroupé et harmonisé (mêmes libellés malgré les fautes de frappe). S'il se répète, le code de la boîte y est ajouté."),
    ("Code-barres de la boîte", "CTN-00000123 : identifiant permanent de la boîte dans GeoArchives (code 128 et QR code sur l'étiquette)."),
    ("Code-barres d'un dossier", "Code de sa boîte + numéro d'ordre : CTN-00000123-0001, CTN-00000123-0002… Scanné dans GeoArchives, il ouvre la fiche de la boîte."),
    ("Boîtes retenues (taille)", f"Seules les boîtes de {GENERIC} dossiers au plus sont retenues."),
    ("Libellés à découper", f"{len(big)} libellé(s) génériques intercalés dans l'inventaire regroupent chacun plus de {GENERIC} dossiers ({sum(g['dossiers'] for g in big)} au total, ex. « Koumassi ») : ce sont plusieurs boîtes physiques sous un même nom. Ils sont listés à part, à découper sur place en boîtes avant étiquetage."),
    ("Extraction", f"Base de production, {data['exportedAt'][:16].replace('T', ' ')} UTC. {len(boxes)} boîtes, {total_dossiers} dossiers."),
]
sheet(wr, ["Élément", "Règle"], [26, 110])
for r in rules: wr.append(list(r))
finish(wr)
xlsx = f"{outdir}/boites-a-recuperer-{len(boxes)}.xlsx"
wb.save(xlsx)

# ---------- Étiquettes des boîtes (A4, 8 par page, 95 x 66 mm) ----------
def box_labels(path):
    c = canvas.Canvas(path, pagesize=A4); W, Hh = A4
    cols, rows, lw, lh, mx, my = 2, 4, 95*mm, 66*mm, 8*mm, 12*mm
    for i, b in enumerate(boxes):
        if i and i % (cols*rows) == 0: c.showPage()
        k = i % (cols*rows); x = mx + (k % cols) * (lw + 4*mm); y = Hh - my - (k // cols + 1) * (lh + 3*mm)
        c.setStrokeColorRGB(.6, .6, .6); c.roundRect(x, y, lw, lh, 2*mm)
        q = qr.QrCodeWidget(f"{APP}/c/{b['code']}"); bx = q.getBounds(); s = 34*mm
        d = Drawing(s, s, transform=[s/(bx[2]-bx[0]), 0, 0, s/(bx[3]-bx[1]), 0, 0]); d.add(q); renderPDF.draw(d, c, x + 3*mm, y + lh - s - 3*mm)
        c.setFont("Helvetica-Bold", 15); c.drawString(x + 40*mm, y + lh - 10*mm, b["code"])
        c.setFont("Helvetica-Bold", 10)
        name = b["name"]; lines = [name[j:j+30] for j in range(0, min(len(name), 90), 30)]
        for j, line in enumerate(lines): c.drawString(x + 40*mm, y + lh - 17*mm - j*4.5*mm, line)
        c.setFont("Helvetica", 7.5)
        c.drawString(x + 40*mm, y + 26*mm, f"{len(b['dossiers'])} dossier(s) · N° {b['rank']}")
        c.drawString(x + 40*mm, y + 22*mm, (b["site"] + " · " + b["salle"])[:48])
        bc = code128.Code128(b["code"], barHeight=14*mm, barWidth=0.38*mm, humanReadable=True)
        bc.drawOn(c, x + (lw - bc.width) / 2, y + 4*mm)
    c.save()

# ---------- Étiquettes des dossiers (A4, 3 x 8 par page, 63 x 33 mm) ----------
def dossier_labels(path):
    c = canvas.Canvas(path, pagesize=A4); W, Hh = A4
    cols, rows, lw, lh, mx, my = 3, 8, 63*mm, 33*mm, 7*mm, 10*mm
    i = 0
    for b in boxes:
        for code, d in b["dossier_codes"]:
            if i and i % (cols*rows) == 0: c.showPage()
            k = i % (cols*rows); x = mx + (k % cols) * (lw + 2*mm); y = Hh - my - (k // cols + 1) * (lh + 1.5*mm)
            c.setStrokeColorRGB(.75, .75, .75); c.rect(x, y, lw, lh)
            bc = code128.Code128(code, barHeight=10*mm, barWidth=0.26*mm, humanReadable=False)
            bc.drawOn(c, x + (lw - bc.width) / 2, y + 17*mm)
            c.setFont("Helvetica-Bold", 8.5); c.drawCentredString(x + lw / 2, y + 12.5*mm, code)
            c.setFont("Helvetica", 7); c.drawString(x + 3*mm, y + 7.5*mm, f'Dossier {d["reference"]}')
            c.setFont("Helvetica", 6.5); c.drawString(x + 3*mm, y + 3*mm, ("Boîte : " + b["name"])[:52])
            i += 1
    c.save()


# ---------- Rapport (PDF) ----------
def report(path):
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    styles = getSampleStyleSheet()
    navy = colors.HexColor("#17284D")
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, textColor=navy, alignment=0, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, textColor=navy, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10)
    exported = datetime.datetime.fromisoformat(data["exportedAt"].replace("Z", "+00:00"))
    to_check = [b for b in boxes if b.get("note")]
    story = [
        Paragraph("Récupération des archives – 200 premières boîtes", h1),
        Paragraph(f"GeoArchives · CEIBA Analytics · données au {exported.strftime('%d/%m/%Y à %H:%M')} (UTC)", small),
        Spacer(1, 8),
        Paragraph("Synthèse", h2),
        Table([
            ["Boîtes retenues", f"{len(boxes)}"],
            ["Dossiers à étiqueter", f"{total_dossiers}"],
            ["Site et salle d'origine", f"{SITE} · Salle 1 · Mezzanine, Tour D"],
            ["Plage des codes de boîtes", f"{boxes[0]['code']} à {boxes[-1]['code']}"],
            ["Boîtes à vérifier sur place", f"{len(to_check)}"],
            ["Libellés génériques à découper", f"{len(big)} ({sum(g['dossiers'] for g in big)} dossiers)"],
        ], colWidths=[70*mm, 100*mm], style=TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 9.5), ("FONT", (1, 0), (1, -1), "Helvetica-Bold", 9.5),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#D0D5DD")), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])),
        Paragraph("Identification des boîtes et des dossiers", h2),
        Paragraph("Chaque boîte reçoit un <b>nom unique</b> (son libellé d'inventaire, harmonisé) et un <b>code-barres</b> permanent "
                  "de la forme <b>CTN-00000123</b>, imprimé en code 128 et en QR code sur son étiquette.", body),
        Paragraph("Chaque dossier porte le <b>code de sa boîte suivi de son numéro d'ordre</b> : CTN-00000123-0001, CTN-00000123-0002… "
                  "Scanné dans GeoArchives, ce code ouvre la fiche de la boîte. Lors de la récupération, on colle l'étiquette de la boîte "
                  "sur le carton et celle de chaque dossier sur sa chemise.", body),
        Paragraph("Points d'attention", h2),
    ]
    if to_check:
        story.append(Paragraph("Boîtes à vérifier avant étiquetage : " + "; ".join(f"{b['code']} « {b['name']} » ({b['note']})" for b in to_check) + ".", body))
    story.append(Paragraph(f"{len(big)} libellés regroupent chacun plus de {GENERIC} dossiers : ce sont plusieurs boîtes physiques sous un même nom "
                           "(liste en annexe). Ils ne figurent pas parmi les 200 boîtes et doivent être découpés en boîtes sur place.", body))
    story += [PageBreak(), Paragraph("Liste des boîtes", h2)]
    rows = [["N°", "Code-barres", "Nom de la boîte", "Dossiers", "Codes des dossiers"]]
    for b in boxes:
        codes = b["dossier_codes"]
        rows.append([str(b["rank"]), b["code"], Paragraph(b["name"], small), str(len(b["dossiers"])), f"…-0001 à …-{len(codes):04d}"])
    table = Table(rows, colWidths=[10*mm, 28*mm, 82*mm, 16*mm, 36*mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5), ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F6FA")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (3, 0), (3, -1), "RIGHT"),
    ]))
    story.append(table)
    if big:
        story += [Paragraph("Annexe – libellés génériques à découper", h2)]
        grows = [["Code actuel", "Libellé", "Dossiers"]] + [[g["code"], Paragraph(g["name"], small), str(g["dossiers"])] for g in big]
        gt = Table(grows, colWidths=[30*mm, 120*mm, 20*mm], repeatRows=1)
        gt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), navy), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5), ("FONT", (0, 1), (-1, -1), "Helvetica", 8), ("ALIGN", (2, 0), (2, -1), "RIGHT")]))
        story.append(gt)
    def footer(canvas_, doc):
        canvas_.setFont("Helvetica", 7.5); canvas_.setFillColor(colors.grey)
        canvas_.drawString(15*mm, 10*mm, "GeoArchives – Récupération des archives MULCV")
        canvas_.drawRightString(A4[0] - 15*mm, 10*mm, f"Page {doc.page}")
    SimpleDocTemplate(path, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=16*mm,
                      title="Récupération – 200 premières boîtes", author="CEIBA Analytics").build(story, onFirstPage=footer, onLaterPages=footer)

box_labels(f"{outdir}/etiquettes-boites.pdf")
dossier_labels(f"{outdir}/etiquettes-dossiers.pdf")
report(f"{outdir}/rapport-boites-a-recuperer-{len(boxes)}.pdf")
summary = {"boxes": len(boxes), "dossiers": total_dossiers, "first": boxes[0]["code"], "last": boxes[-1]["code"], "site": SITE,
           "toCheck": sum(1 for b in boxes if b.get("note")), "generic": len(big), "genericDossiers": sum(g["dossiers"] for g in big), "exportedAt": data["exportedAt"]}
json.dump(summary, open(f"{outdir}/summary.json", "w", encoding="utf-8"), ensure_ascii=False)
print(json.dumps({"boxes": len(boxes), "dossiers": total_dossiers, "max": max(len(b["dossiers"]) for b in boxes), "last": boxes[-1]["code"], "generic": [(g["code"], g["name"], g["dossiers"]) for g in big]}, ensure_ascii=False))

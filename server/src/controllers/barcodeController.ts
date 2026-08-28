import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface BoardingPassData {
  ticket_id: string;
  passenger_name: string;
  flight_id: string;
  date: string;
  from: string;
  to: string;
  terminal: string;
  seat: string;
}

export function parseBoardingPassBarcode(rawInput: string): BoardingPassData {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Barcode content is empty');
  }

  const raw = rawInput.trim();

  // 1. JSON Payload Format
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      const p = JSON.parse(raw);
      const dataObj = Array.isArray(p) ? p[0] : p;
      if (dataObj && typeof dataObj === 'object') {
        const ticket_id = String(dataObj.ticket_id || dataObj.pnr || dataObj.booking_reference || dataObj.id || 'N/A').trim();
        const passenger_name = String(dataObj.passenger_name || dataObj.name || dataObj.passenger || 'Unknown').trim();
        const flight_id = String(dataObj.flight_id || dataObj.flightNumber || dataObj.flight_no || dataObj.flight || 'N/A').trim().toUpperCase();
        const date = String(dataObj.date || dataObj.flight_date || 'N/A').trim();
        const fromCode = String(dataObj.from || dataObj.origin || dataObj.departure || 'N/A').trim().toUpperCase();
        const toCode = String(dataObj.to || dataObj.destination || dataObj.arrival || 'N/A').trim().toUpperCase();
        const seat = String(dataObj.seat || dataObj.seat_assignment || dataObj.seat_no || 'N/A').trim().toUpperCase();

        return { ticket_id, passenger_name, flight_id, date, from: fromCode, to: toCode, terminal: 'T1', seat };
      }
    } catch (e) {}
  }

  // 2. Standard IATA BCBP Format
  if (raw[0] === 'M') {
    let nameRaw = '';
    let pnr = 'N/A';
    let fromCode = 'N/A';
    let toCode = 'N/A';
    let carrier = '';
    let flightNum = '';
    let julianStr = '';
    let seat = 'N/A';

    if (raw.length >= 45) {
      nameRaw = raw.substring(2, 22).trim();
      pnr = raw.substring(23, 30).trim();
      fromCode = raw.substring(30, 33).trim().toUpperCase();
      toCode = raw.substring(33, 36).trim().toUpperCase();
      carrier = raw.substring(36, 39).trim().toUpperCase();
      flightNum = raw.substring(39, 44).trim().replace(/^0+/, '');
      julianStr = raw.substring(44, 47).trim();
      if (raw.length >= 52) {
        seat = raw.substring(48, 52).trim().replace(/^0+/, '') || 'N/A';
      }
    }

    if (!/^[A-Z]{3}$/.test(fromCode) || !/^[A-Z]{3}$/.test(toCode)) {
      const bcbpRegex = /^M[1-9]?([A-Z\/\s]+?)(?:[E\s])([A-Z0-9]{5,8})\s*([A-Z]{3})([A-Z]{3})([A-Z0-9\s]{2,3})\s*([A-Z0-9]{1,5})\s*([0-9]{3})[A-Z\s]?([A-Z0-9]{2,4})?/i;
      const m = raw.match(bcbpRegex);
      if (m) {
        nameRaw = m[1].trim(); pnr = m[2].trim(); fromCode = m[3].toUpperCase(); toCode = m[4].toUpperCase();
        carrier = m[5].trim().toUpperCase(); flightNum = m[6].trim().replace(/^0+/, '');
        julianStr = m[7].trim(); if (m[8]) seat = m[8].trim().replace(/^0+/, '') || 'N/A';
      }
    }

    let passenger_name = nameRaw;
    if (nameRaw.includes('/')) {
      const [surname, rest] = nameRaw.split('/');
      const cleanRest = (rest || '').trim().replace(/\s+(MR|MRS|MS|MISS|DR|PROF)$/i, '');
      passenger_name = cleanRest ? `${cleanRest} ${surname.trim()}`.trim() : surname.trim();
    }

    const flight_id = (carrier + flightNum).trim() || 'N/A';
    let date = 'N/A';
    const julianDay = parseInt(julianStr, 10);
    if (!isNaN(julianDay) && julianDay >= 1 && julianDay <= 366) {
      const d = new Date(new Date().getFullYear(), 0, julianDay);
      date = d.toISOString().split('T')[0];
    }

    return { ticket_id: pnr || 'N/A', passenger_name: passenger_name || 'Unknown', flight_id, date, from: fromCode, to: toCode, terminal: 'T1', seat };
  }

  // 3. Key-Value Fallback
  const pnrMatch = raw.match(/(?:PNR|TICKET|BOOKING|ID|RECORD)[:=\s]+([A-Z0-9]+)/i);
  const nameMatch = raw.match(/(?:NAME|PASSENGER)[:=\s]+([A-Z\s\/]+?)(?=[|,\n\r;]|$)/i);
  const flightMatch = raw.match(/(?:FLIGHT|FLIGHT_NO|FLIGHT_ID)[:=\s]+([A-Z0-9-]+)/i);
  const seatMatch = raw.match(/(?:SEAT|SEAT_NO|SEAT_ASSIGNMENT)[:=\s]+([A-Z0-9]+)/i);
  const fromMatch = raw.match(/(?:FROM|ORIGIN|DEPARTURE)[:=\s]+([A-Z]{3})/i);
  const toMatch = raw.match(/(?:TO|DEST|DESTINATION|ARRIVAL)[:=\s]+([A-Z]{3})/i);
  const dateMatch = raw.match(/(?:DATE)[:=\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);

  if (flightMatch || pnrMatch || nameMatch) {
    let pname = nameMatch ? nameMatch[1].trim() : 'Unknown';
    if (pname.includes('/')) { const [s, r] = pname.split('/'); pname = `${r.trim()} ${s.trim()}`.trim(); }
    return {
      ticket_id: pnrMatch?.[1].trim() ?? 'N/A', passenger_name: pname || 'Unknown',
      flight_id: flightMatch?.[1].trim().toUpperCase() ?? 'N/A', date: dateMatch?.[1].trim() ?? 'N/A',
      from: fromMatch?.[1].trim().toUpperCase() ?? 'N/A', to: toMatch?.[1].trim().toUpperCase() ?? 'N/A',
      terminal: 'T1', seat: seatMatch?.[1].trim().toUpperCase() ?? 'N/A',
    };
  }

  throw new Error('Barcode decoded successfully, but does not contain valid boarding pass data.');
}

export async function decodeBarcodeHandler(req: Request, res: Response): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `barcode_${Date.now()}.png`);

  try {
    let imageBuffer: Buffer | null = null;

    if (req.body && req.body.imageBase64) {
      const base64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    }

    if (!imageBuffer) {
      res.status(400).json({ success: false, error: 'No image data provided' });
      return;
    }

    fs.writeFileSync(tmpFile, imageBuffer);

    // Python script using zxingcpp with median filter pre-processing for screen photos
    const pyScript = `
import zxingcpp
from PIL import Image, ImageFilter
import sys, json

try:
    img = Image.open(r'${tmpFile.replace(/\\/g, '\\\\')}').convert('L')
    res = zxingcpp.read_barcodes(img, formats=zxingcpp.BarcodeFormat.PDF417, try_rotate=True)
    if not res:
        # Apply median filter for screen photos
        img_f = img.filter(ImageFilter.MedianFilter(size=3))
        res = zxingcpp.read_barcodes(img_f, formats=zxingcpp.BarcodeFormat.PDF417, try_rotate=True)
    
    if res:
        print(json.dumps({'text': res[0].text}))
    else:
        print(json.dumps({'text': None}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

    exec(`python -c "${pyScript.replace(/\n/g, ' ')}"`, (err, stdout, stderr) => {
      if (fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch {}
      }

      if (err || !stdout) {
        res.status(422).json({ success: false, error: 'Failed to execute barcode engine' });
        return;
      }

      try {
        const output = JSON.parse(stdout.trim());
        if (output.text) {
          const parsed = parseBoardingPassBarcode(output.text);
          res.json({ success: true, raw: output.text, data: parsed });
        } else {
          res.status(404).json({ success: false, error: 'No barcode detected in image' });
        }
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

  } catch (err: any) {
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    res.status(500).json({ success: false, error: err.message });
  }
}

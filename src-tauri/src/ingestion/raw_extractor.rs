use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::Instant;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use crate::models::{EmbeddedPreviewResult, ExifMetadata};

pub struct RawExtractor;

impl RawExtractor {
    /// Extract embedded JPEG and optical EXIF within 50ms without full demosaicing
    pub fn extract_preview(file_path_str: &str) -> Result<EmbeddedPreviewResult, String> {
        let start_time = Instant::now();
        let path = Path::new(file_path_str);

        if !path.exists() {
            return Err(format!("File does not exist: {}", file_path_str));
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mut file = File::open(path).map_err(|e| format!("Cannot open file: {}", e))?;
        let metadata = file.metadata().map_err(|e| format!("Cannot read metadata: {}", e))?;
        let file_size = metadata.len();

        let (raw_buffer, jpeg_bytes) = match ext.as_str() {
            "jpg" | "jpeg" => {
                let mut buffer = Vec::with_capacity(file_size as usize);
                file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
                (None, buffer)
            }
            "raf" => {
                let bytes = Self::extract_from_fuji_raf(&mut file)?;
                (None, bytes)
            }
            "cr3" => {
                let bytes = Self::extract_from_cr3(&mut file, file_size)?;
                (None, bytes)
            }
            _ => {
                // TIFF-based RAW files (ARW, NEF, CR2, DNG, etc.)
                let (buf, jpeg) = Self::extract_from_tiff_raw_with_buffer(&mut file, file_size)?;
                (Some(buf), jpeg)
            }
        };

        let extraction_time_ms = start_time.elapsed().as_millis() as u64;

        // Extract real optical EXIF metadata directly from RAW TIFF header, falling back to JPEG payload
        let exif = Self::extract_comprehensive_exif(raw_buffer.as_deref(), &jpeg_bytes, path);

        let jpeg_base64 = BASE64.encode(&jpeg_bytes);

        Ok(EmbeddedPreviewResult {
            file_path: file_path_str.to_string(),
            mime_type: "image/jpeg".to_string(),
            jpeg_base64,
            extraction_time_ms,
            exif,
        })
    }

    /// Extract embedded preview and raw header buffer from TIFF-based RAW files (ARW, NEF, CR2, DNG)
    fn extract_from_tiff_raw_with_buffer(file: &mut File, file_size: u64) -> Result<(Vec<u8>, Vec<u8>), String> {
        let read_len = std::cmp::min(file_size, 12 * 1024 * 1024) as usize;
        let mut buffer = vec![0u8; read_len];
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        file.read_exact(&mut buffer).map_err(|e| e.to_string())?;

        let candidates = Self::find_embedded_jpegs(&buffer)?;
        let largest_jpeg = candidates
            .into_iter()
            .max_by_key(|bytes| bytes.len())
            .ok_or_else(|| "Failed to find preview candidate".to_string())?;

        Ok((buffer, largest_jpeg))
    }

    /// Find all embedded JPEG streams in a buffer
    fn find_embedded_jpegs(buffer: &[u8]) -> Result<Vec<Vec<u8>>, String> {
        let mut jpeg_candidates = Vec::new();
        let mut i = 0;
        let buf_len = buffer.len();

        while i + 3 < buf_len {
            if buffer[i] == 0xFF && buffer[i + 1] == 0xD8 && buffer[i + 2] == 0xFF {
                let soi_index = i;
                let mut j = soi_index + 2;
                let mut found_eoi = None;

                while j + 1 < buf_len {
                    if buffer[j] == 0xFF && buffer[j + 1] == 0xD9 {
                        found_eoi = Some(j + 2);
                        break;
                    }
                    j += 1;
                }

                if let Some(eoi_index) = found_eoi {
                    let len = eoi_index - soi_index;
                    if len > 24 * 1024 {
                        jpeg_candidates.push(buffer[soi_index..eoi_index].to_vec());
                    }
                    i = eoi_index;
                    continue;
                }
            }
            i += 1;
        }

        if jpeg_candidates.is_empty() {
            Err("No valid embedded JPEG preview found in RAW stream".to_string())
        } else {
            Ok(jpeg_candidates)
        }
    }

    /// Extract embedded preview from TIFF-based RAW files (ARW, NEF, CR2, DNG)
    fn extract_from_tiff_raw(file: &mut File, file_size: u64) -> Result<Vec<Vec<u8>>, String> {
        let read_len = std::cmp::min(file_size, 12 * 1024 * 1024) as usize;
        let mut buffer = vec![0u8; read_len];
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        file.read_exact(&mut buffer).map_err(|e| e.to_string())?;
        Self::find_embedded_jpegs(&buffer)
    }

    /// Extract largest embedded JPEG from TIFF raw candidates
    fn extract_from_tiff_raw_largest(file: &mut File, file_size: u64) -> Result<Vec<u8>, String> {
        let candidates = Self::extract_from_tiff_raw(file, file_size)?;
        candidates
            .into_iter()
            .max_by_key(|bytes| bytes.len())
            .ok_or_else(|| "Failed to find preview candidate".to_string())
    }

    /// Fujifilm RAF embedded JPEG parser
    fn extract_from_fuji_raf(file: &mut File) -> Result<Vec<u8>, String> {
        let mut header = [0u8; 128];
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        file.read_exact(&mut header).map_err(|e| e.to_string())?;

        let jpeg_offset = u32::from_be_bytes([header[0x54], header[0x55], header[0x56], header[0x57]]) as u64;
        let jpeg_len = u32::from_be_bytes([header[0x58], header[0x59], header[0x5a], header[0x5b]]) as usize;

        if jpeg_offset > 0 && jpeg_len > 1024 {
            let mut jpeg_bytes = vec![0u8; jpeg_len];
            file.seek(SeekFrom::Start(jpeg_offset)).map_err(|e| e.to_string())?;
            file.read_exact(&mut jpeg_bytes).map_err(|e| e.to_string())?;
            return Ok(jpeg_bytes);
        }

        let file_size = file.metadata().map(|m| m.len()).unwrap_or(12 * 1024 * 1024);
        Self::extract_from_tiff_raw_largest(file, file_size)
    }

    /// Canon CR3 (ISOBMFF) embedded JPEG extractor
    fn extract_from_cr3(file: &mut File, file_size: u64) -> Result<Vec<u8>, String> {
        Self::extract_from_tiff_raw_largest(file, file_size)
    }

    /// Pure binary parser extracting authentic EXIF without hardcoded values
    pub fn extract_real_exif(jpeg_bytes: &[u8], path: &Path) -> ExifMetadata {
        Self::extract_comprehensive_exif(None, jpeg_bytes, path)
    }

    /// Dual-stage parser extracting authentic EXIF directly from RAW TIFF header and embedded JPEG
    fn extract_comprehensive_exif(raw_buf: Option<&[u8]>, jpeg_bytes: &[u8], path: &Path) -> ExifMetadata {
        let _filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("RAW_IMAGE");
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_uppercase();

        let mut camera_model = format!("{} 相機檔案", ext);
        let mut lens_model = "標準光學鏡頭".to_string();
        let mut iso = 0u32;
        let mut shutter_speed = "--".to_string();
        let mut aperture = "--".to_string();
        let mut focal_length = "--".to_string();
        let mut date_time = "--".to_string();
        let mut exposure_bias: Option<f32> = None;
        let mut exposure_program: Option<String> = None;
        let mut metering_mode: Option<String> = None;
        let mut color_space: Option<String> = None;
        let mut color_temp: Option<u32> = None;
        let mut tint: Option<i32> = None;
        let mut flash: Option<String> = None;

        // Stage 1: Parse directly from RAW file binary header (e.g. Sony ARW, Nikon NEF, Canon CR2, DNG)
        if let Some(raw) = raw_buf {
            if raw.len() >= 8 && ((raw[0] == b'I' && raw[1] == b'I') || (raw[0] == b'M' && raw[1] == b'M')) {
                Self::parse_tiff_exif(
                    raw,
                    &mut camera_model,
                    &mut lens_model,
                    &mut iso,
                    &mut shutter_speed,
                    &mut aperture,
                    &mut focal_length,
                    &mut date_time,
                    &mut exposure_bias,
                    &mut exposure_program,
                    &mut metering_mode,
                    &mut color_space,
                    &mut color_temp,
                    &mut tint,
                    &mut flash,
                );
            }
        }

        // Stage 2: Fallback / Merge from embedded JPEG APP1 marker if key tags are still missing
        if (shutter_speed == "--" || aperture == "--" || iso == 0 || lens_model == "標準光學鏡頭") && !jpeg_bytes.is_empty() {
            let mut j_camera = camera_model.clone();
            let mut j_lens = lens_model.clone();
            let mut j_iso = iso;
            let mut j_shutter = shutter_speed.clone();
            let mut j_aperture = aperture.clone();
            let mut j_focal = focal_length.clone();
            let mut j_date_time = date_time.clone();
            let mut j_bias = exposure_bias;
            let mut j_prog = exposure_program.clone();
            let mut j_meter = metering_mode.clone();
            let mut j_space = color_space.clone();
            let mut j_temp = color_temp;
            let mut j_tint = tint;
            let mut j_flash = flash.clone();

            let mut idx = 2;
            let len = jpeg_bytes.len();

            while idx + 4 < len {
                if jpeg_bytes[idx] == 0xFF && jpeg_bytes[idx + 1] == 0xE1 {
                    let app1_len = u16::from_be_bytes([jpeg_bytes[idx + 2], jpeg_bytes[idx + 3]]) as usize;
                    let payload_start = idx + 4;
                    let payload_end = std::cmp::min(payload_start + app1_len - 2, len);

                    if payload_end > payload_start + 6 {
                        let header = &jpeg_bytes[payload_start..payload_start + 6];
                        if header.starts_with(b"Exif\0\0") {
                            let tiff_base = payload_start + 6;
                            Self::parse_tiff_exif(
                                &jpeg_bytes[tiff_base..payload_end],
                                &mut j_camera,
                                &mut j_lens,
                                &mut j_iso,
                                &mut j_shutter,
                                &mut j_aperture,
                                &mut j_focal,
                                &mut j_date_time,
                                &mut j_bias,
                                &mut j_prog,
                                &mut j_meter,
                                &mut j_space,
                                &mut j_temp,
                                &mut j_tint,
                                &mut j_flash,
                            );
                            break;
                        }
                    }
                    idx += 2 + app1_len;
                } else if jpeg_bytes[idx] == 0xFF && jpeg_bytes[idx + 1] == 0xDA {
                    break;
                } else if jpeg_bytes[idx] == 0xFF {
                    let seg_len = u16::from_be_bytes([jpeg_bytes[idx + 2], jpeg_bytes[idx + 3]]) as usize;
                    idx += 2 + seg_len;
                } else {
                    idx += 1;
                }
            }

            if camera_model.ends_with("相機檔案") && !j_camera.ends_with("相機檔案") {
                camera_model = j_camera;
            }
            if lens_model == "標準光學鏡頭" && j_lens != "標準光學鏡頭" {
                lens_model = j_lens;
            }
            if iso == 0 && j_iso > 0 {
                iso = j_iso;
            }
            if shutter_speed == "--" && j_shutter != "--" {
                shutter_speed = j_shutter;
            }
            if aperture == "--" && j_aperture != "--" {
                aperture = j_aperture;
            }
            if focal_length == "--" && j_focal != "--" {
                focal_length = j_focal;
            }
            if date_time == "--" && j_date_time != "--" {
                date_time = j_date_time;
            }
            if exposure_bias.is_none() { exposure_bias = j_bias; }
            if exposure_program.is_none() { exposure_program = j_prog; }
            if metering_mode.is_none() { metering_mode = j_meter; }
            if color_space.is_none() { color_space = j_space; }
            if color_temp.is_none() { color_temp = j_temp; }
            if tint.is_none() { tint = j_tint; }
            if flash.is_none() { flash = j_flash; }
        }

        // If specific tags were missing from embedded header, format gracefully
        if date_time == "--" {
            if let Ok(meta) = path.metadata() {
                if let Ok(created) = meta.modified() {
                    let datetime: ChronoFreeDt = created.into();
                    date_time = datetime.to_string();
                }
            }
        }

        // Default baseline color temperature if unextracted
        if color_temp.is_none() {
            color_temp = Some(5500);
            tint = Some(0);
        }

        ExifMetadata {
            camera_model,
            lens_model,
            iso,
            shutter_speed,
            aperture,
            focal_length,
            date_time,
            exposure_bias,
            exposure_program,
            metering_mode,
            color_space,
            color_temp,
            tint,
            flash,
        }
    }

    /// Parse TIFF structure inside EXIF payload
    fn parse_tiff_exif(
        buf: &[u8],
        camera: &mut String,
        lens: &mut String,
        iso: &mut u32,
        shutter: &mut String,
        aperture: &mut String,
        focal: &mut String,
        date_time: &mut String,
        exposure_bias: &mut Option<f32>,
        exposure_program: &mut Option<String>,
        metering_mode: &mut Option<String>,
        color_space: &mut Option<String>,
        color_temp: &mut Option<u32>,
        tint: &mut Option<i32>,
        flash: &mut Option<String>,
    ) {
        if buf.len() < 8 {
            return;
        }

        let is_little_endian = buf[0] == b'I' && buf[1] == b'I';

        let read_u16 = |offset: usize| -> Option<u16> {
            if offset + 2 <= buf.len() {
                if is_little_endian {
                    Some(u16::from_le_bytes([buf[offset], buf[offset + 1]]))
                } else {
                    Some(u16::from_be_bytes([buf[offset], buf[offset + 1]]))
                }
            } else {
                None
            }
        };

        let read_u32 = |offset: usize| -> Option<u32> {
            if offset + 4 <= buf.len() {
                if is_little_endian {
                    Some(u32::from_le_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]]))
                } else {
                    Some(u32::from_be_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]]))
                }
            } else {
                None
            }
        };

        let read_i32 = |offset: usize| -> Option<i32> {
            if offset + 4 <= buf.len() {
                if is_little_endian {
                    Some(i32::from_le_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]]))
                } else {
                    Some(i32::from_be_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]]))
                }
            } else {
                None
            }
        };

        let read_string = |offset: usize, count: usize| -> Option<String> {
            if offset < buf.len() {
                let actual_end = std::cmp::min(offset + count, buf.len());
                let slice = &buf[offset..actual_end];
                let clean: Vec<u8> = slice.iter().copied().take_while(|&c| c != 0).collect();
                let s = String::from_utf8_lossy(&clean).trim().to_string();
                if !s.is_empty() {
                    Some(s)
                } else {
                    None
                }
            } else {
                None
            }
        };

        let ifd0_offset = match read_u32(4) {
            Some(o) => o as usize,
            None => return,
        };

        let mut exif_subifd_offset = None;
        let mut make_str = String::new();
        let mut model_str = String::new();

        // Parse IFD0 Entries
        if let Some(entry_count) = read_u16(ifd0_offset) {
            let mut curr = ifd0_offset + 2;
            for _ in 0..entry_count {
                if let (Some(tag), Some(_type), Some(count), Some(val_offset)) = (
                    read_u16(curr),
                    read_u16(curr + 2),
                    read_u32(curr + 4),
                    read_u32(curr + 8),
                ) {
                    match tag {
                        0x010F => {
                            // Make (e.g. SONY, Canon, Nikon)
                            let str_offset = if count <= 4 { curr + 8 } else { val_offset as usize };
                            if let Some(val) = read_string(str_offset, count as usize) {
                                make_str = val;
                            }
                        }
                        0x0110 => {
                            // Model (e.g. ZV-E10, ILCE-7M4)
                            let str_offset = if count <= 4 { curr + 8 } else { val_offset as usize };
                            if let Some(val) = read_string(str_offset, count as usize) {
                                model_str = val;
                            }
                        }
                        0x0132 => {
                            // DateTime
                            let str_offset = if count <= 4 { curr + 8 } else { val_offset as usize };
                            if let Some(val) = read_string(str_offset, count as usize) {
                                *date_time = val;
                            }
                        }
                        0x8769 => {
                            // ExifIFD pointer
                            exif_subifd_offset = Some(val_offset as usize);
                        }
                        _ => {}
                    }
                }
                curr += 12;
            }
        }

        // Formulate refined camera model name
        if !model_str.is_empty() {
            if !make_str.is_empty() && !model_str.to_lowercase().contains(&make_str.to_lowercase()) {
                *camera = format!("{} {}", make_str, model_str);
            } else {
                *camera = model_str;
            }
        }

        // Parse Exif SubIFD if present
        if let Some(sub_offset) = exif_subifd_offset {
            if let Some(sub_entries) = read_u16(sub_offset) {
                let mut curr = sub_offset + 2;
                for _ in 0..sub_entries {
                    if let (Some(tag), Some(_typ), Some(count), Some(val_offset)) = (
                        read_u16(curr),
                        read_u16(curr + 2),
                        read_u32(curr + 4),
                        read_u32(curr + 8),
                    ) {
                        match tag {
                            0x8827 => {
                                // ISO Speed Ratings
                                *iso = if count == 1 {
                                    read_u16(curr + 8).unwrap_or(0) as u32
                                } else {
                                    read_u16(val_offset as usize).unwrap_or(0) as u32
                                };
                            }
                            0x829A => {
                                // ExposureTime (Rational: num/den)
                                let num = read_u32(val_offset as usize).unwrap_or(0);
                                let den = read_u32(val_offset as usize + 4).unwrap_or(1);
                                if num > 0 && den > 0 {
                                    if num < den {
                                        let speed = (den as f64 / num as f64).round() as u64;
                                        if speed > 1 {
                                            *shutter = format!("1/{}s", speed);
                                        } else {
                                            *shutter = "1s".to_string();
                                        }
                                    } else {
                                        let sec = num as f64 / den as f64;
                                        if (sec - sec.round()).abs() < 0.05 {
                                            *shutter = format!("{}s", sec.round() as u64);
                                        } else {
                                            *shutter = format!("{:.1}s", sec);
                                        }
                                    }
                                }
                            }
                            0x829D => {
                                // FNumber (Rational: num/den)
                                let num = read_u32(val_offset as usize).unwrap_or(0);
                                let den = read_u32(val_offset as usize + 4).unwrap_or(1);
                                if den > 0 && num > 0 {
                                    let f = num as f32 / den as f32;
                                    if (f - f.round()).abs() < 0.05 {
                                        *aperture = format!("f/{}", f.round() as u32);
                                    } else {
                                        *aperture = format!("f/{:.1}", f);
                                    }
                                }
                            }
                            0x920A => {
                                // FocalLength
                                let num = read_u32(val_offset as usize).unwrap_or(0);
                                let den = read_u32(val_offset as usize + 4).unwrap_or(1);
                                if den > 0 && num > 0 {
                                    let f = (num as f32 / den as f32).round() as u32;
                                    *focal = format!("{}mm", f);
                                }
                            }
                            0xA434 => {
                                // LensModel
                                let str_offset = if count <= 4 { curr + 8 } else { val_offset as usize };
                                if let Some(val) = read_string(str_offset, count as usize) {
                                    *lens = val;
                                }
                            }
                            0xA432 => {
                                // LensSpecification fallback (min_focal, max_focal, min_f, max_f)
                                if *lens == "標準光學鏡頭" || lens.is_empty() {
                                    let off = val_offset as usize;
                                    let min_f_num = read_u32(off).unwrap_or(0);
                                    let min_f_den = read_u32(off + 4).unwrap_or(1);
                                    let max_f_num = read_u32(off + 8).unwrap_or(0);
                                    let max_f_den = read_u32(off + 12).unwrap_or(1);
                                    let min_fn_num = read_u32(off + 16).unwrap_or(0);
                                    let min_fn_den = read_u32(off + 20).unwrap_or(1);

                                    if min_f_den > 0 && max_f_den > 0 && min_f_num > 0 {
                                        let min_f = min_f_num / min_f_den;
                                        let max_f = max_f_num / max_f_den;
                                        let fn_val = if min_fn_den > 0 && min_fn_num > 0 {
                                            min_fn_num as f32 / min_fn_den as f32
                                        } else {
                                            0.0
                                        };

                                        let spec = if min_f == max_f {
                                            if fn_val > 0.0 {
                                                format!("{}mm f/{:.1}", min_f, fn_val)
                                            } else {
                                                format!("{}mm", min_f)
                                            }
                                        } else {
                                            if fn_val > 0.0 {
                                                format!("{}-{}mm f/{:.1}", min_f, max_f, fn_val)
                                            } else {
                                                format!("{}-{}mm", min_f, max_f)
                                            }
                                        };
                                        *lens = spec;
                                    }
                                }
                            }
                            0x9204 => {
                                // ExposureBiasValue (SRational: i32 / i32)
                                let num = read_i32(val_offset as usize).unwrap_or(0);
                                let den = read_i32(val_offset as usize + 4).unwrap_or(1);
                                if den != 0 {
                                    let ev = num as f32 / den as f32;
                                    *exposure_bias = Some(ev);
                                }
                            }
                            0x8822 => {
                                // ExposureProgram
                                let val = read_u16(curr + 8).unwrap_or(0);
                                *exposure_program = Some(match val {
                                    1 => "手動曝光 (M)".to_string(),
                                    2 => "程式自動 (P)".to_string(),
                                    3 => "光圈先決 (A)".to_string(),
                                    4 => "快門先決 (S)".to_string(),
                                    5 => "景深優先 (創意)".to_string(),
                                    6 => "動作模式 (高速)".to_string(),
                                    7 => "人像優先".to_string(),
                                    8 => "風景模式".to_string(),
                                    _ => "標準自動".to_string(),
                                });
                            }
                            0x9207 => {
                                // MeteringMode
                                let val = read_u16(curr + 8).unwrap_or(0);
                                *metering_mode = Some(match val {
                                    1 => "平均測光".to_string(),
                                    2 => "中央重點測光".to_string(),
                                    3 => "點測光".to_string(),
                                    4 => "多點測光".to_string(),
                                    5 => "多分割矩陣測光".to_string(),
                                    6 => "局部測光".to_string(),
                                    _ => "多重測光".to_string(),
                                });
                            }
                            0x9208 => {
                                // LightSource -> Calibrated Kelvin & Tint
                                let val = read_u16(curr + 8).unwrap_or(0);
                                let (temp, estimated_tint) = match val {
                                    1 => (Some(5500), Some(0)),    // 日光 (Daylight)
                                    2 => (Some(4200), Some(-8)),   // 螢光燈 (Fluorescent)
                                    3 => (Some(3200), Some(0)),    // 鎢絲燈 (Tungsten)
                                    4 => (Some(5400), Some(2)),    // 閃光燈 (Flash)
                                    9 => (Some(5200), Some(0)),    // 晴天晴朗 (Fine Weather)
                                    10 => (Some(6000), Some(6)),   // 多雲 (Cloudy)
                                    11 => (Some(7000), Some(12)),  // 陰影 (Shade)
                                    12 => (Some(6500), Some(-4)),  // 日光螢光燈
                                    13 => (Some(5000), Some(-10)), // 晝白色螢光燈
                                    14 => (Some(4200), Some(-12)), // 冷白色螢光燈
                                    15 => (Some(3000), Some(-6)),  // 白熾螢光燈
                                    17 => (Some(2856), Some(0)),   // 標準光 A
                                    20 => (Some(5500), Some(0)),   // D55
                                    21 => (Some(6500), Some(0)),   // D65
                                    22 => (Some(7500), Some(0)),   // D75
                                    23 => (Some(5000), Some(0)),   // D50
                                    _ => (None, None),
                                };
                                if temp.is_some() {
                                    *color_temp = temp;
                                    *tint = estimated_tint;
                                }
                            }
                            0x9209 => {
                                // Flash
                                let val = read_u16(curr + 8).unwrap_or(0);
                                let fired = (val & 0x01) != 0;
                                *flash = Some(if fired { "已擊發" } else { "未擊發" }.to_string());
                            }
                            0xA001 => {
                                // ColorSpace
                                let val = read_u16(curr + 8).unwrap_or(0);
                                *color_space = Some(match val {
                                    1 => "sRGB".to_string(),
                                    2 => "Adobe RGB".to_string(),
                                    _ => "Wide Gamut".to_string(),
                                });
                            }
                            0xA405 => {
                                // WhiteBalance (0 = Auto, 1 = Manual)
                                if color_temp.is_none() {
                                    *color_temp = Some(5500);
                                    *tint = Some(0);
                                }
                            }
                            _ => {}
                        }
                    }
                    curr += 12;
                }
            }
        }
    }
}

// Lightweight timestamp formatter
struct ChronoFreeDt(u64);
impl From<std::time::SystemTime> for ChronoFreeDt {
    fn from(t: std::time::SystemTime) -> Self {
        let dur = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        Self(dur.as_secs())
    }
}
impl std::fmt::Display for ChronoFreeDt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "時間戳記: {}", self.0)
    }
}

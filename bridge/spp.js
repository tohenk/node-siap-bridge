/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2022-2024 Toha <tohenk@yahoo.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const SiapBridge = require('.');
const SiapQueue = require('../queue');
const SiapPage = require('../siap/page');
const { By } = require('selenium-webdriver');

class SiapSppBridge extends SiapBridge {

    COL_ICON = 1
    COL_STATUS = 2
    COL_SINGLE = 3

    checkRekanan(queue) {
        let clicker;
        const page = new SiapPage(this.siap, {
            title: 'Daftar Rekanan',
            search: {
                input: By.id('search-access-control'),
                submit: By.xpath('//button[text()="Cari Sekarang"]'),
            },
        });
        return this.works([
            [w => this.siap.navigate('Pengeluaran', 'Daftar Rekanan')],
            [w => this.siap.waitLoader()],
            [w => page.setup()],
            [w => page.search(queue.getMappedData('rekanan.nama_perusahaan'))],
            [w => page.each({filtered: true}, el => [
                [x => this.siap.getText([By.xpath('./td[3]/div/span/div[2]/span')], el)],
                [x => el.findElement(By.xpath('./td[6]/div/div/div'))],
                [x => new Promise((resolve, reject) => {
                    const values = x.getRes(0); 
                    const nik = values[0];
                    if (nik === queue.getMappedData('rekanan.nik')) {
                        clicker = x.getRes(1);
                        reject(SiapPage.stop());
                    } else {
                        resolve();
                    }
                })],
            ])],
            [w => this.siap.waitAndClick(By.xpath('//button[text()="Tambah Rekanan"]')), w => !clicker],
            [w => clicker.click(), w => clicker],
            [w => this.fillForm(queue, 'rekanan',
                By.xpath('//h1[text()="Informasi Rekanan"]/../../..'),
                By.xpath('//button/span/span[text()="Simpan"]'))],
        ]);
    }

    isSppExist(queue, options) {
        let result;
        const tgl = this.getDate(queue.getMappedData('spp.spp:TGL'));
        const nominal = queue.getMappedData('spp.spp:NOMINAL');
        const untuk = queue.getMappedData('spp.spp:UNTUK');
        const title = options.title;
        const jenis = options.jenis;
        const page = new SiapPage(this.siap, {
            title: title,
            search: {
                filter: By.xpath('//div[@class="container-form-filter-table"]/*/*/*/*[1]/div/button'),
                input: By.xpath('//div[@class="container-form-filter-table"]/*/*/*/*[2]/div/input'),
                submit: By.xpath('//div[@class="container-form-filter-table"]/*/*/*/*[3]/div/div'),
            },
        });
        let untukSppIdx, untukSppUseTippy;
        const tvalues = [];
        const tselectors = {
            [this.COL_ICON]: '*/*/*[2]/*[1]',
            [this.COL_STATUS]: '*/*/*/p',
            [this.COL_SINGLE]: '*/*/span',
        }
        // index, withIcon, withTippy
        const columns = {
            noSpp: 1,
            tglSpp: 4,
            untukSpp: [5, this.COL_SINGLE, true],
            nomSpp: 6,
            statusSpp: [2, this.COL_STATUS],
        }
        for (const k in columns) {
            const v = options.columns && options.columns[k] ? options.columns[k] : columns[k];
            const idx = Array.isArray(v) ? v[0] : (typeof v === 'object' ? v.index : v);
            const colType = Array.isArray(v) ? v[1] : (typeof v === 'object' && v.type ? v.type : this.COL_ICON);
            const withTippy = Array.isArray(v) ? v[2] : (typeof v === 'object' && v.tippy ? v.tippy : false);
            let selector = typeof v === 'object' && v.selector ? v.selector : tselectors[colType];
            if (withTippy) {
                selector = '*/*/' + selector;
            }
            tvalues.push(By.xpath(`./td[${idx}]/${selector}`));
            if (k === 'untukSpp') {
                untukSppIdx = idx;
                untukSppUseTippy = withTippy;
            }
        }
        return this.works([
            [w => this.siap.waitAndClick(By.xpath(`//button/p[text()="${jenis}"]/..`))],
            [w => page.setup()],
            [w => page.search(untuk, 'Keterangan')],
            [w => page.each({filtered: true}, el => [
                [x => this.siap.getText(tvalues, el)],
                [x => el.findElement(By.xpath(`./td[${untukSppIdx}]/div[@class="custom-tippy"]/div`))],
                [x => this.getTippy(x.getRes(1)), w => untukSppUseTippy],
                [x => new Promise((resolve, reject) => {
                    const values = x.getRes(0);
                    const noSpp = values[0];
                    const tglSpp = this.getDate(values[1]);
                    const untukSpp = untukSppUseTippy ? x.getRes(2) : values[2];
                    const nomSpp = parseFloat(this.pickNumber(values[3]));
                    const statusSpp = values[4];
                    if (this.dateSerial(tgl) == this.dateSerial(tglSpp) && nominal == nomSpp && this.getSafeStr(untuk) == this.getSafeStr(untukSpp)) {
                        result = el;
                        queue.SPP = noSpp;
                        queue.STATUS = statusSpp;
                        reject(SiapPage.stop());
                    } else {
                        resolve();
                    }
                })],
            ])],
            [w => Promise.resolve(result)],
        ]);
    }

    isSppNeeded(queue) {
        const title = 'Surat Permintaan Pembayaran (SPP) | Langsung';
        return this.works([
            [w => this.isSppExist(queue, {title, jenis: 'Sudah Diverifikasi'})],
            [w => this.isSppExist(queue, {title, jenis: 'Belum Diverifikasi'}), w => !w.getRes(0)],
        ]);
    }

    checkSpp(queue) {
        return this.works([
            [w => this.siap.navigate('Pengeluaran', 'SPP', 'Pembuatan', 'LS')],
            [w => this.isSppNeeded(queue)],
            [w => this.siap.waitAndClick(By.xpath('//button/span/p[text()="Tambah Surat Permintaan Pembayaran"]/../..')), w => !w.getRes(1)],
            [w => this.siap.waitAndClick(By.xpath('//a/span/p[text()="SPP LS (Barang & Jasa)"]/../..')), w => !w.getRes(1)],
            [w => Promise.resolve(this.spp = {}), w => !w.getRes(1)],
            [w => this.fillForm(queue, 'spp',
                By.xpath('//h1[text()="Tambah Surat Permintaan Pembayaran | Langsung (Barang dan Jasa)"]/../../..'),
                By.xpath('//button/span/span[text()="Konfirmasi"]')), w => !w.getRes(1)],
            [w => this.siap.waitAndClick(By.xpath('//button[text()="Tambah Sekarang"]')), w => !w.getRes(1)],
        ]);
    }

    checkVerifikasiSpp(queue) {
        const title = 'Surat Permintaan Pembayaran (SPP) | Verifikasi';
        return this.works([
            [w => Promise.reject('SPP belum dibuat!'), w => !queue.SPP],
            [w => this.siap.navigate('Pengeluaran', 'SPP', 'Verifikasi')],
            [w => this.isSppExist(queue, {title, jenis: 'Sudah Diverifikasi'})],
            [w => this.isSppExist(queue, {title, jenis: 'Belum Diverifikasi'}), w => !w.getRes(2)],
            [w => w.getRes(3).findElement(By.xpath('./td[9]/div/button')), w => w.getRes(3)],
            [w => w.getRes(4).click(), w => w.getRes(3)],
            [w => w.getRes(4).findElement(By.xpath('../div/div/button/span/p[text()="Verifikasi"]/../..')), w => w.getRes(3)],
            [w => w.getRes(6).click(), w => w.getRes(3)],
            [w => this.fillForm(queue, 'verifikasi-spp',
                By.xpath('//header[text()="Verifikasi (SPP)"]/../div[contains(@class,"chakra-modal__body")]'),
                By.xpath('//button[text()="Setujui Sekarang"]')), w => w.getRes(3)],
            [w => this.dismissModal('Verifikasi SPP Berhasil'), w => w.getRes(3)],
        ]);
    }

    checkVerifikasiSpm(queue, status = 'Belum Disetujui') {
        const title = 'Surat Perintah Membayar | Pembuatan';
        const columns = {
            noSpp: [1, this.COL_ICON, true],
            tglSpp: 3,
            untukSpp: [6, this.COL_SINGLE, true],
            nomSpp: 7,
            statusSpp: {index: 4, type: this.COL_STATUS, selector: '*/*/p'},
        }
        return this.works([
            [w => Promise.reject('SPP belum dibuat!'), w => !queue.SPP],
            [w => this.siap.navigate('Pengeluaran', 'SPM', 'Pembuatan')],
            [w => this.siap.waitAndClick(By.xpath('//button/p[text()="LS"]/..'))],
            [w => this.isSppExist(queue, {title, columns, jenis: 'LS Sudah Diverifikasi'})],
            [w => this.isSppExist(queue, {title, columns, jenis: 'LS Belum Diverifikasi'}), w => !w.getRes(3)],
            [w => w.getRes(4).findElement(By.xpath('./td[9]/div/button')), w => w.getRes(4) && queue.STATUS === status],
            [w => w.getRes(5).click(), w => w.getRes(4) && queue.STATUS === status],
            [w => w.getRes(5).findElement(By.xpath('../div/div/button/span/p[text()="Persetujuan"]/../..')), w => w.getRes(4) && queue.STATUS === status],
            [w => w.getRes(7).click(), w => w.getRes(4) && queue.STATUS === status],
            [w => this.siap.waitAndClick(By.xpath('//header[text()="Persetujuan SPM"]/../footer/button[text()="Setujui Sekarang"]')), w => w.getRes(4) && queue.STATUS === status],
        ]);
    }

    createSpp(queue) {
        return this.do([
            // switch role
            [w => this.checkRole(queue)],
            // --- BP ---
            [w => this.doAs(this.ROLE_BP)],
            [w => this.checkRekanan(queue)],
            [w => this.checkSpp(queue)],
            // --- PPK ---
            [w => this.doAs(this.ROLE_PPK)],
            [w => this.checkVerifikasiSpp(queue)],
            // --- PA ---
            [w => this.doAs(this.ROLE_PA)],
            [w => this.checkVerifikasiSpm(queue)],
            // logout
            [w => this.siap.logout()],
            // result
            [ w => new Promise((resolve, reject) => {
                if (queue.SPP && queue.callback) {
                    const callbackQueue = SiapQueue.createCallbackQueue({id: queue.getMappedData('info.id'), spp: queue.SPP}, queue.callback);
                    SiapQueue.addQueue(callbackQueue);
                }
                resolve(queue.SPP ? queue.SPP : false);
            })],
        ]);
    }
}

module.exports = SiapSppBridge;
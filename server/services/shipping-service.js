const axios = require('axios');
const pricingService = require('./pricing-service');

const COUNTRY_MAP = {
    Jamaica: 'JM',
    USA: 'US',
    UK: 'GB',
    Canada: 'CA'
};

const DHL_PACKAGES = {
    'Box 3': { dimensions: { length: 33, width: 30, height: 10 }, maxWeight: 2 },
    'Box 4': { dimensions: { length: 33, width: 32, height: 18 }, maxWeight: 5 },
    'Box 5': { dimensions: { length: 33, width: 32, height: 34 }, maxWeight: 10 },
    'Box 6': { dimensions: { length: 41, width: 35, height: 36 }, maxWeight: 15 },
    'Box 7': { dimensions: { length: 48, width: 40, height: 38 }, maxWeight: 20 },
    'Box 8': { dimensions: { length: 54, width: 44, height: 4 }, maxWeight: 25 },
    'Box 2 Shoe': { dimensions: { length: 33, width: 18, height: 10 }, maxWeight: 1 },
    'Tube Large': { dimensions: { length: 97, width: 17, height: 15 }, maxWeight: 5 },
    Envelopes: { dimensions: { length: 35, width: 27, height: 1 }, maxWeight: 0.5 },
    'Flyer Standard': { dimensions: { length: 40, width: 30, height: 1 }, maxWeight: 2 },
    'Flyer Large': { dimensions: { length: 47, width: 38, height: 1 }, maxWeight: 4 }
};

function getShippingRates() {
    const config = pricingService.loadConfig();
    const dhlUsdToJmd = Number(config.shippingRates?.dhlUsdToJmd);
    const dhlGbpToJmd = Number(config.shippingRates?.dhlGbpToJmd);

    if (!Number.isFinite(dhlUsdToJmd) || !Number.isFinite(dhlGbpToJmd)) {
        throw new Error('Shipping exchange-rate configuration is missing.');
    }

    return { dhlUsdToJmd, dhlGbpToJmd };
}

function selectPackage(shipmentType, rawWeight) {
    const finalWeight = Math.ceil(Number(rawWeight) || (shipmentType === 'small' ? 0.35 : 1.05));

    if (shipmentType === 'small') {
        return {
            finalWeight,
            packageName: finalWeight <= 2 ? 'Flyer Standard' : 'Flyer Large',
            packageInfo: DHL_PACKAGES[finalWeight <= 2 ? 'Flyer Standard' : 'Flyer Large']
        };
    }

    let packageName = 'Box 3';
    if (finalWeight <= 2) {
        packageName = 'Box 3';
    } else if (finalWeight <= 5) {
        packageName = 'Box 4';
    } else if (finalWeight <= 10) {
        packageName = 'Box 5';
    } else {
        packageName = 'Box 6';
    }

    return { finalWeight, packageName, packageInfo: DHL_PACKAGES[packageName] };
}

async function calculateDhlQuote({ country, city, zip, shipmentType = 'large', weight }) {
    const apiKey = process.env.DHL_API_KEY;
    const apiSecret = process.env.DHL_API_SECRET;
    const accountNumber = process.env.DHL_ACCOUNT_NUMBER;

    if (!apiKey || !apiSecret || !accountNumber) {
        const err = new Error('DHL credentials missing. Cannot calculate live shipping rate.');
        err.statusCode = 500;
        throw err;
    }

    const destCountryCode = COUNTRY_MAP[country] || 'GB';
    const { finalWeight, packageName, packageInfo } = selectPackage(shipmentType, weight);
    const today = new Date().toISOString().split('T')[0];

    const params = new URLSearchParams({
        accountNumber,
        originCountryCode: process.env.DHL_ORIGIN_COUNTRY_CODE || 'JM',
        originCityName: process.env.DHL_ORIGIN_CITY_NAME || 'Kingston',
        destinationCountryCode: destCountryCode,
        destinationCityName: city || 'Unknown',
        weight: finalWeight,
        length: packageInfo.dimensions.length,
        width: packageInfo.dimensions.width,
        height: packageInfo.dimensions.height,
        plannedShippingDate: today,
        isCustomsDeclarable: 'true',
        unitOfMeasurement: 'metric'
    });

    if (zip && String(zip).trim() !== '') {
        params.append('destinationPostalCode', String(zip).trim());
    }

    const dhlEnv = process.env.DHL_ENVIRONMENT || 'sandbox';
    const dhlBaseUrl = dhlEnv === 'production'
        ? 'https://express.api.dhl.com/mydhlapi/rates'
        : 'https://express.api.dhl.com/mydhlapi/test/rates';

    const response = await axios.get(`${dhlBaseUrl}?${params.toString()}`, {
        headers: {
            Authorization: `Basic ${Buffer.from(apiKey + ':' + apiSecret).toString('base64')}`
        }
    });

    const products = response.data?.products || [];
    if (products.length === 0) throw new Error('No shipping products found for this route');

    const product = products.find(p => p.productCode === 'P' || p.productCode === 'D')
        || products.find(p => p.productName?.toUpperCase().includes('EXPRESS WORLDWIDE'))
        || products[0];
    const totalPriceInfo = product.totalPrice?.find(p => p.currencyType === 'BILLC') || product.totalPrice?.[0];

    if (!totalPriceInfo || !totalPriceInfo.price) {
        throw new Error('Price missing in DHL response');
    }

    const rates = getShippingRates();
    let cost = Number(totalPriceInfo.price);
    let currency = totalPriceInfo.priceCurrency;

    if (currency === 'USD') {
        cost *= rates.dhlUsdToJmd;
        currency = 'JMD';
    } else if (currency === 'GBP') {
        cost *= rates.dhlGbpToJmd;
        currency = 'JMD';
    }

    return {
        cost,
        currency,
        service: product.productName || 'DHL Express',
        packageName,
        finalWeight
    };
}

module.exports = {
    calculateDhlQuote
};

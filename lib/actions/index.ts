"use server"

import { revalidatePath } from "next/cache";
import Product from "../models/product.model";
import { connectToDB } from "../mongoose";
import { scrapeAmazonProduct } from "../scraper";
import { getAveragePrice, getHighestPrice, getLowestPrice } from "../utils";
import { generateEmailBody, sendEmail } from "../nodemailer";
import { User } from "@/types";

export async function scrapeAndStoreProduct(productUrl: string) {
    if(!productUrl) return;
  
    try {
      connectToDB();
  
      const scrapedProduct = await scrapeAmazonProduct(productUrl);
  
      if(!scrapedProduct) return;
  
      let product = scrapedProduct;
  
      const existingProduct = await Product.findOne({ url: scrapedProduct.url });
      
      /**If the product with the same url exists, we need to update its price history */
      if(existingProduct) {
        const updatedPriceHistory: any = [
          ...existingProduct.priceHistory,
          { price: scrapedProduct.currentPrice }
        ]
  
        product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory),
        }
      }
      /**If product does not exits, create an instance of the product in the DB */
      const newProduct = await Product.findOneAndUpdate(
        { url: scrapedProduct.url },
        product,
        { upsert: true, new: true }
      );
      
      /**If we dont revalidate the path, its not going to update and it will be stuck in cache */
      revalidatePath(`/products/${newProduct._id}`);
    } catch (error: any) {
      throw new Error(`Failed to create/update product: ${error.message}`)
    }
  }

export async function getProductById(productId: string) {
    try {
      connectToDB();
  
      const product = await Product.findOne({ _id: productId });
  
      if(!product) return null;
  
      return product;
    } catch (error) {
      console.log(error);
    }
  }

export async function getAllProducts() {
    try {
      connectToDB();
  
      const products = await Product.find();
  
      return products;
    } catch (error) {
      console.log(error);
    }
  }

export async function getSimilarProducts(productId: string) {
    try {
      connectToDB();
  
      const currentProduct = await Product.findById(productId);
  
      if(!currentProduct) return null;
      
      /**Find all products whose id is not equal to the id of the current product */
      const similarProducts = await Product.find({
        _id: { $ne: productId },
      }).limit(3);
  
      return similarProducts;
    } catch (error) {
      console.log(error);
    }
  }

export async function addUserEmailToProduct(productId: string, userEmail: string) {
    try {
      const product = await Product.findById(productId);
  
      if(!product) return;
  
      const userExists = product.users.some((user: User) => user.email === userEmail);
  
      if(!userExists) {
        product.users.push({ email: userEmail });
  
        await product.save();
  
        const emailContent = await generateEmailBody(product, "WELCOME");
  
        await sendEmail(emailContent, [userEmail]);
      }
    } catch (error) {
      console.log(error);
    }
  }